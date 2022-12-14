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
const getUserReturnInfo = require("../utils/getUserReturnInfo");

// user profile
router.get("/user", verifyUser, async (req, res) => {
  try {
    const user = await User.findById(req.reqUser._id);
    if (!user) throw Error("User does not exist");

    res.status(200).json({
      success: true,
      user: getUserReturnInfo(user._doc),
      message: "User fetch successfully",
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

// edit avatar
router.post(
  "/avatar",
  verifyUser,
  upload.single("avatar"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) throw Error("No file found");
      // check image type
      if (file.mimetype !== "image/jpeg" && file.mimetype !== "image/png")
        throw Error("File type not supported");

      const extension = file.originalname.split(".").pop();

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

      res.status(200).json({
        success: true,
        message: "Avatar uploaded successfully",
        user: getUserReturnInfo(user._doc),
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }
);

router.put("/user", verifyUser, async (req, res) => {
  try {
    const { name, email } = req.body.details;

    // check if email is dup
    const validEMail = await User.findOne({ email });
    if (validEMail && validEMail._id != req.reqUser._id) {
      throw Error("Email already in use by someone else");
    }

    const user = await User.findOneAndUpdate(
      { _id: req.reqUser._id },
      { name, email },
      { new: true }
    );
    if (!user) throw Error("User does not exist");

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: getUserReturnInfo(user._doc),
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
