const router = require("express").Router();

const verifyAdmin = require("../utils/verifyAdmin");

const User = require("../models/User");
const Post = require("../models/Post");

router.get("/get-users", verifyAdmin, async (req, res) => {
  try {
    const users = await User.find({})
      .select("-password")
      .populate("posts", ["description"], null, { sort: { createdAt: -1 } });
    if (!users) throw new Error("No users found");

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// get all posts
router.get("/get-all-posts", verifyAdmin, async (req, res) => {
  try {
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .populate("user", ["name", "avatar"])
      .populate("comments.user", ["name", "avatar"])
      .populate("likes", ["name", "avatar"])

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

router.delete("/delete-users", verifyAdmin, async (req, res) => {
  try {
    const { users } = req.body;
    if (!users) throw new Error("No users to delete");

    const deletedUsers = await User.deleteMany({ _id: { $in: users } });
    if (!deletedUsers) throw new Error("Users could not be deleted");
    if (deletedUsers.deletedCount !== users.length) {
      throw new Error("Some users were not deleted");
    }

    return res.status(200).json({
      success: true,
      message: "Users deleted successfully",
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

module.exports = router;
