import { ActiveSession } from "./models/activeSession"

export type AuthResponse = {
  success: boolean,
  msg?: string
}

export async function reqAuth(token: string): Promise<AuthResponse> {
  const session = await ActiveSession.find({ token: token });
  if (session.length == 1) {
    return { success: true };
  } else {
    return { success: false, msg: "User is not logged on" };
  }
}

export const MONGO_DB_URI = "mongodb+srv://genezio:genezio@cluster0.c6qmwnq.mongodb.net/?retryWrites=true&w=majority"
