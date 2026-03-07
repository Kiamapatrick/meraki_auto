// backend/services/smsService.js

import africasTalking from "../config/africastalking.js";

const sms = africasTalking.SMS;
console.log("AT USERNAME:", process.env.AT_USERNAME);
console.log("AT KEY LOADED:", process.env.AT_API_KEY?.slice(0, 10));


// Access-code-specific SMS removed as part of cleanup.