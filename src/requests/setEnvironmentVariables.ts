import axios from './axios.js';
import { getAuthToken } from '../utils/accounts.js';
import { BACKEND_ENDPOINT } from '../constants.js';
import version from '../utils/version.js';
import { EnvironmentVariable } from '../models/environmentVariables.js';

export async function setEnvironmentVariables(
  projectId: string,
  environmentVariablesData: EnvironmentVariable[],
) {
  // validate parameters
  if (!projectId) {
    throw new Error('Missing required parameters');
  }

  // Check if user is authenticated
  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error(
      "You are not logged in. Run 'genezio login' before you deploy your function.",
    );
  }

  const data = JSON.stringify({environmentVariables: environmentVariablesData});

  const response: any = await axios({
    method: 'POST',
    url: `${BACKEND_ENDPOINT}/projects/${projectId}/environment-variables`,
    data: data,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Accept-Version': `genezio-cli/${version}`,
    },
  }).catch((error: Error) => {
    throw error;
  });


  if (response.data.status === 'error') {
    throw new Error(response.data.message);
  }

  if (response.data?.error?.message) {
    throw new Error(response.data.error.message);
  }

}
