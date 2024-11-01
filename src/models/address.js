const mongoose = require('mongoose')

const addressSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true,
        max: 10
    },
    address : {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: true
    },
    district: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    country: {
        type: String,
        required: true
    },
    postalCode: {
        type: String,
        required: true
    },
    addressType: {
        type: String,
        enum: ['home','work','other'],
        default: 'home'
    },
    isDefault: {
        type: Boolean,
        default: false
    }
},{
    timestamps: true
})

module.exports = mongoose.model("Address",addressSchema)
