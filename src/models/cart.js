const mongoose = require('mongoose')

const cartSchema = new mongoose.Schema({
    productId : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,

    },
    variantId : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'productVariant',
        required: true
    },
    userId: {
        type:mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    price: {
        type: Number,
        required: true
    }

})

module.exports = mongoose.model('Cart',cartSchema)