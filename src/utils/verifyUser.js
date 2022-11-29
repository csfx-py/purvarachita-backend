const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) throw Error("No token found");

    const { _id, role } = jwt.verify(token, process.env.ACCESS_TOKEN_SEC);

    const user = User.findById(_id);
    if (!user) throw Error("User does not exist");

    if (!role)
      throw Error("You are not authorized to access this resource");

    req.reqUser = { _id, role };

    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      message: "Unauthorized" + err.message,
    });
  }
};
