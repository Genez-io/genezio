import axios from "axios";
import { AstSummary, AstSummaryClass } from "../models/astSummary";
import { getAuthToken } from "../utils/accounts";
import { BACKEND_ENDPOINT } from "../variables";

export async function sendProjectAst(
  projectName: string,
  region = "us-east-1",
  astSummary: AstSummary
) {
  if (!astSummary) {
    throw new Error("Ast summary is not provided");
  }

  // Check if user is authenticated
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error(
      "You are not logged in. Run 'genezio login' before you deploy your function."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = astSummary;

  json.projectName = projectName;
  json.region = region;

  json.classes = json.classes.map((c: AstSummaryClass) => {
    return {
      name: c.name,
      ast: JSON.stringify({ methods: c.methods })
    };
  });

  const rawData = JSON.stringify(json);

  const response: any = await axios({
    method: "POST",
    url: `${BACKEND_ENDPOINT}/projects/ast`,
    data: rawData,
    headers: { Authorization: `Bearer ${authToken}` },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  }).catch((error: Error) => {
    throw error;
  });

  if (response.data.status === "error") {
    throw new Error(response.data.message);
  }

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

  return response.data;
}
