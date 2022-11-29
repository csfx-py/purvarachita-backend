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
    const posts = await Post.find({}).sort({ createdAt: -1 });
    if (!posts.length) throw new Error("No posts found");

    const userIdNameAvatar = {};
    // add username to each post
    const postsWithUser = await Promise.all(
      posts.map(async (post) => {
        // comments find username and avatar
        const commentsWithUser = await Promise.all(
          post.comments.map(async (comment) => {
            if (userIdNameAvatar[comment.user]) {
              return {
                ...comment._doc,
                name: userIdNameAvatar[comment.user].name,
                avatar: userIdNameAvatar[comment.user].avatar,
              };
            } else {
              const user = await User.findById(comment.user);
              if (!user) throw new Error("User not found");

              userIdNameAvatar[comment.user] = {
                name: user.name,
                avatar: user.avatar,
              };
            }
            return {
              ...comment._doc,
              name: userIdNameAvatar[comment.user].name,
              avatar: userIdNameAvatar[comment.user].avatar,
            };
          })
        );

        if (userIdNameAvatar[post.user]) {
          return {
            ...post._doc,
            name: userIdNameAvatar[post.user].name,
            avatar: userIdNameAvatar[post.user].avatar,
            comments: commentsWithUser,
          };
        }
        const user = await User.findById(post.user);
        if (!user) throw new Error("User not found");

        userIdNameAvatar[post.user] = {
          name: user.name,
          avatar: user.avatar,
        };
        return {
          ...post._doc,
          name: userIdNameAvatar[post.user].name,
          avatar: userIdNameAvatar[post.user].avatar,
          comments: commentsWithUser,
        };
      })
    );

    res.status(200).json({
      success: true,
      posts: postsWithUser,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// Create a post with multiple pdf files
router.post("/create", verifyUser, upload.array("files"), async (req, res) => {
  try {
    const { description, user } = req.body;
    const files = req.files;

    const userDoc = await User.findById(user);
    if (!userDoc) throw new Error("User not found");

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
      description,
      user,
      files: downloadUrls,
    });

    // save the post
    const savedPost = await post.save();
    if (!savedPost) throw new Error("Something went wrong saving the post");

    // add the post to the user's posts
    userDoc.posts.push(savedPost._id);
    const savedUser = await userDoc.save();
    if (!savedUser)
      throw new Error("Something went wrong saving post to the user");

    res.status(200).json({
      success: true,
      message: "Post created successfully",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

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

    // delete the post from the user's posts
    const user = await User.findById(post.user);
    if (!user) throw new Error("User not found");

    user.posts = user.posts.filter((post) => post.toString() !== postId);

    const savedUser = await user.save();
    if (!savedUser)
      throw new Error("Something went wrong deleting post from the user");

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
    const { postId, text, user, date } = req.body;

    const post = await Post.findById(postId);
    if (!post) throw new Error("Post not found");

    const newComment = {
      text,
      user,
      date,
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

module.exports = router;
