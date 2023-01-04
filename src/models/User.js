const mongoose = require("mongoose");

// User schema
const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  posts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },
  ],
  paidForPosts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },
  ],
  avatar: {
    type: String,
    default: "",
  },
  role: {
    type: String,
    default: "user",
  },
  otp: {
    type: String,
    default: "",
  },
  isOnboarded: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// deleteOne hook
UserSchema.pre("deleteOne", async function (next) {
  try {
    const Post = require("./Post");
    const posts = await Post.deleteMany({ user: this._conditions._id });

    next();
  } catch (err) {
    next(err);
  }
});

UserSchema.pre("deleteMany", async function (next) {
  try {
    const Post = require("./Post");
    const posts = await Post.deleteMany({
      user: { $in: this._conditions._id },
    });

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("User", UserSchema);
