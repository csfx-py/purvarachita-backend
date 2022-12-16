const mongoose = require("mongoose");

// Post Schema
const PostSchema = new mongoose.Schema({
  description: {
    type: String,
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  files: [
    {
      url: {
        type: String,
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      fileName: {
        type: String,
        required: true,
      },
    },
  ],
  likes: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      num: {
        type: Number,
        default: 0,
      },
    },
  ],
  comments: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      text: {
        type: String,
        required: true,
      },
      date: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// pre delete middleware remove refs from User
PostSchema.pre("deleteOne", async function (next) {
  try {
    const User = require("./User");
    const post = await this.model.findOne(this.getQuery());

    await User.updateOne({ _id: post.user }, { $pull: { posts: post._id } });

    next();
  } catch (err) {
    console.log(err);
    next(err);
  }
});

// pre save middleware save new refs to User
PostSchema.pre("save", async function (next) {
  try {
    const User = require("./User");
    const post = this;

    await User.updateOne({ _id: post.user }, { $push: { posts: post._id } });

    next();
  } catch (err) {
    console.log(err);
    next(err);
  }
});

PostSchema.pre("deleteMany", async function (next) {
  try {
    const User = require("./User");
    const posts = await this.model.find(this.getQuery());

    for (let post of posts) {
      await User.updateOne({ _id: post.user }, { $pull: { posts: post._id } });
    }

    next();
  } catch (err) {
    console.log(err);
    next(err);
  }
});


module.exports = mongoose.model("Post", PostSchema);
