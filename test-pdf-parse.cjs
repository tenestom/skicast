const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('invite.pdf');

pdf(dataBuffer).then(function(data) {
    console.log("TEXT");
    console.log(data.text);
}).catch(console.error);
