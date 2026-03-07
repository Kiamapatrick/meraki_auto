import AfricasTalking from "africastalking";

const africasTalking = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});

export default africasTalking;