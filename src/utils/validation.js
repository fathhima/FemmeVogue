const validator = require('validator')

const validateSignUpData = (req) => {
    const {firstName,emailId,password} = req.body
    if(!firstName) {
        throw new Error("name is required")
    } else if(!validator.isEmail(emailId)){
        throw new Error("email is not valid")
    } else if(!validator.isStrongPassword(password)){
        throw new Error("please enter a strong password")
    }
}

module.exports = {validateSignUpData}