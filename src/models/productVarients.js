const mongoose = require('mongoose')

const productVarientSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    size : {
        type: String,
        required: true,
        trim: true
    },
    color : {
        type: String,
        required: true,
        trim: true
    },
    price: {
        type: Number,
        required:true,
        min: 0
    },
    stock: {
        type: Number,
        required:true,
        min: 0
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    maxPerperson: {
        type: String,
        max: 10
    }
},
{
    timestamps: true
})

module.exports = mongoose.model('productVariant',productVarientSchema)