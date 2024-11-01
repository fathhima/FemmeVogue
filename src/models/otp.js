const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    otp: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: {
        expires: '1m'
      }
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("otp", otpSchema);