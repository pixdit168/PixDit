import { requestHandler } from "../app-backend.js";

export default async function handler(request, response) {
  return requestHandler(request, response);
}
