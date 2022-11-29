const router = require("express").Router();
const app = require("../config/firebase_config");
const {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} = require("firebase/storage");

const storage = getStorage(app);
const multer = require("multer");
const upload = multer({
  storage: multer.memoryStorage(),
});

const User = require("../models/User");
const verifyUser = require("../utils/verifyUser");

router.get("/user", verifyUser, async (req, res) => {
  try {
    const user = await User.findById(req.reqUser._id);
    if (!user) throw Error("User does not exist");

    // remove password from response
    const { _id, name, email, posts, avatar } = user._doc;

    res.status(200).json({
      success: true,
      user: {
        _id,
        name,
        email,
        posts,
        avatar,
      },
      message: "User fetched successfully",
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

router.post(
  "/avatar",
  verifyUser,
  // multer accept only image file
  upload.single("avatar"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) throw Error("No file found");

      const extension = file.originalname.split(".").pop();

      // check if file is image
      if (!["jpg", "jpeg", "png"].includes(extension))
        throw Error("File type not supported");

      const storageRef = ref(
        storage,
        `avatars/${req.reqUser._id}.${extension}`
      );

      const uploadTask = uploadBytes(storageRef, file.buffer);

      const snapshot = await uploadTask;
      const downloadURL = await getDownloadURL(snapshot.ref);
      if (!downloadURL) throw Error("Failed to get download URL");

      // update user avatar
      const user = await User.findOneAndUpdate(
        { _id: req.reqUser._id },
        { avatar: downloadURL },
        { new: true }
      );
      if (!user) throw Error("User does not exist");

      const { _id, name, email, posts, avatar } = user._doc;

      res.status(200).json({
        success: true,
        message: "Avatar uploaded successfully",
        user: {
          _id,
          name,
          email,
          posts,
          avatar,
        },
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }
);

module.exports = router;
