const mongoose = require('mongoose')

const connectDB = async () => {
    await mongoose.connect("mongodb+srv://fathima:BXOxNXpSkQLR3DSW@cluster0.hnocn.mongodb.net/FemmeVogue")
}

module.exports = connectDB
























