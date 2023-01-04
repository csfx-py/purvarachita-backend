const router = require("express").Router();
const verifyUser = require("../utils/verifyUser");
const app = require("../config/firebase_config");
const {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} = require("firebase/storage");
const stripe = require("stripe")(process.env.STRIPE_KEY);

const storage = getStorage(app);
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
});

const User = require("../models/User");
const Post = require("../models/Post");

// get all posts
router.get("/get-all-posts", verifyUser, async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate("user", ["name", "avatar"])
      .populate("comments.user", ["name", "avatar"])
      .populate("likes", ["name", "avatar"]);

    res.status(200).json({
      success: true,
      posts,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

router.post("/purchase", verifyUser, async (req, res) => {
  try {
    const { postId } = req.body;

    const post = await Post.findById(postId);
    if (!post) throw Error("Post not found");

    const { title, price } = post;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "inr",
            product_data: {
              name: title,
            },
            unit_amount: price * 100,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `http://localhost:3000/success/${postId}/{CHECKOUT_SESSION_ID}`,
      cancel_url: `http://localhost:3000/cancel`,
    });

    res.status(200).json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.post("/verify-payment", verifyUser, async (req, res) => {
  try {
    const { sessionId, postId } = req.body;
    console.log(sessionId, postId);

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) throw Error("Session not found");

    const { payment_status } = session;
    if (payment_status !== "paid") throw Error("Payment not successful");

    const post = await Post.findById(postId);
    if (!post) throw Error("Post not found");

    const user = req.reqUser._id;
    const added = await User.findByIdAndUpdate(user, {
      $addToSet: {
        paidForPosts: postId,
      },
    });
    if (!added) throw Error("Something went wrong adding the post to user");

    res.status(200).json({
      success: true,
      message: "Payment successful",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Create a post with multiple pdf files
router.post("/create", verifyUser, upload.array("files"), async (req, res) => {
  try {
    const { title, description, user, isPaid, price } = req.body;
    const files = req.files;

    // check if files has only image and pdf
    const isImageOrPdfOrJson = files.every((file) => {
      // check mime type
      const isImage = file.mimetype.startsWith("image/");
      const isPdf = file.mimetype === "application/pdf";
      const isJson = file.mimetype === "application/json";
      return isImage || isPdf || isJson;
    });
    if (!isImageOrPdfOrJson)
      throw new Error("Only image, pdf and json files are allowed");

    const userDoc = await User.findById(user);
    if (!userDoc) throw new Error("User not found");

    // sort files as images first, pdfs second and json last
    files.sort((a, b) => {
      const isImageA = a.mimetype.startsWith("image/");
      const isImageB = b.mimetype.startsWith("image/");
      const isPdfA = a.mimetype === "application/pdf";
      const isPdfB = b.mimetype === "application/pdf";
      const isJsonA = a.mimetype === "application/json";
      const isJsonB = b.mimetype === "application/json";

      if (isImageA && isPdfB) return -1;
      if (isPdfA && isImageB) return 1;
      if (isPdfA && isJsonB) return -1;
      if (isJsonA && isPdfB) return 1;
      return 0;
    });

    // upload files to firebase storage and get the download urls
    const downloadUrls = await Promise.all(
      files.map(async (file) => {
        const t = new Date().getTime();
        const storageRef = ref(storage, `${user}/${t}-${file.originalname}`);
        await uploadBytes(storageRef, file.buffer);
        const downloadUrl = await getDownloadURL(storageRef);
        return {
          name: file.originalname,
          url: downloadUrl,
          fileName: `${user}/${t}-${file.originalname}`,
          t,
        };
      })
    );

    // create a new post in mongodb
    const post = new Post({
      title,
      description,
      user,
      files: downloadUrls,
      isPaid,
      price,
    });

    // save the post
    const savedPost = await post.save();
    if (!savedPost) throw new Error("Something went wrong saving the post");

    res.status(200).json({
      success: true,
      message: "Post created successfully",
      postId: savedPost._id,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// delete a post
router.delete("/delete", verifyUser, async (req, res) => {
  try {
    const { postId } = req.body;

    const post = await Post.findById(postId);
    if (!post) throw new Error("Post not found");

    // delete the files from firebase storage
    await Promise.all(
      post.files.map(async (file) => {
        const storageRef = ref(storage, `${file.fileName}`);
        if (storageRef) {
          await deleteObject(storageRef);
        } else {
          throw new Error("File not found");
        }
      })
    );

    // delete the post from mongodb
    const deletedPost = await Post.deleteOne({ _id: postId });
    if (!deletedPost) throw new Error("Something went wrong deleting the post");

    res.status(200).json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// route to add comment
router.post("/add-comment", verifyUser, async (req, res) => {
  try {
    const { postId, text, user } = req.body;

    const post = await Post.findById(postId);
    if (!post) throw new Error("Post not found");

    const newComment = {
      text,
      user,
    };

    post.comments.unshift(newComment);

    const savedPost = await post.save();
    if (!savedPost) throw new Error("Something went wrong saving the post");

    res.status(200).json({
      success: true,
      message: "Comment added successfully",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// route to delete comment
router.delete("/delete-comment", verifyUser, async (req, res) => {
  try {
    const { postId, commentId } = req.body;

    const post = await Post.findById(postId);
    if (!post) throw new Error("Post not found");

    post.comments = post.comments.filter(
      (comment) => comment._id.toString() !== commentId
    );

    const savedPost = await post.save();
    if (!savedPost) throw new Error("Something went wrong saving the post");

    res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

router.patch("/like-or-dislike", verifyUser, async (req, res) => {
  try {
    const { postId } = req.body;
    const userId = req.reqUser._id;

    // find and update the post
    const post = await Post.findById(postId);
    if (!post) throw new Error("Post not found");

    // check if the post is already liked by the user
    if (post.likes.filter((like) => like.toString() === userId).length > 0) {
      post.likes = post.likes.filter((like) => like.toString() !== userId);
    } else {
      post.likes.unshift(userId);
    }

    const savedPost = await post.save();
    if (!savedPost) throw new Error("Something went wrong saving the post");

    res.status(200).json({
      success: true,
      message: "Post liked successfully",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// search posts
router.get("/search", verifyUser, async (req, res) => {
  try {
    const { query } = req.query;

    const userId = await User.find({
      name: { $regex: query, $options: "i" },
    }).select("_id");

    const posts = await Post.find({
      $or: [
        // search by user name from user ref
        { user: { $in: userId } },
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
      ],
    })
      .sort({ createdAt: -1 })
      .populate("user", ["name", "avatar"])
      .populate("comments.user", ["name", "avatar"])
      .populate("likes.user", ["name", "avatar"]);
    if (!posts) throw new Error("Posts not found");

    res.status(200).json({
      success: true,
      posts,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// get my posts
router.get("/get-my-posts", verifyUser, async (req, res) => {
  try {
    const user = req.reqUser._id;

    const posts = await Post.find({ user })
      .sort({ createdAt: -1 })
      .populate("user", ["name", "avatar"])
      .populate("comments.user", ["name", "avatar"])
      .populate("likes.user", ["name", "avatar"]);
    if (!posts) throw new Error("Posts not found");

    res.status(200).json({
      success: true,
      posts,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// get posts of single user
router.get("/get-user-posts", verifyUser, async (req, res) => {
  try {
    const { userId } = req.query;

    const posts = await Post.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("user", ["name", "avatar", "email"])
      .populate("comments.user", ["name", "avatar"])
      .populate("likes.user", ["name", "avatar"]);
    if (!posts) throw new Error("Posts not found");

    res.status(200).json({
      success: true,
      posts,
      user: { ...posts[0].user._doc, numPosts: posts.length },
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// get single post
router.get("/get-post", verifyUser, async (req, res) => {
  try {
    const { postId } = req.query;

    const post = await Post.findById(postId)
      .populate("user", ["name", "avatar"])
      .populate("comments.user", ["name", "avatar"])
      .populate("likes.user", ["name", "avatar"]);
    if (!post) throw new Error("Post not found");

    res.status(200).json({
      success: true,
      post,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

module.exports = router;
