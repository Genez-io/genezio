#!/usr/bin/python3

import os
import requests
import test as gnz_test
from utils import read_config_file_to_json, get_auth_token, get_project_id

NODE_FILENAME = "../client/test-hello-sdk.ts"

# Test order matters because the commands are having side effects.
if __name__ == '__main__':
    print("Starting Hello World test...")

    os.chdir("../../examples/hello-world-ts/server/")
    configuration = read_config_file_to_json()
    print("Succesfully read `genezio.yaml`")

    gnz_test.test_genezio_account()
    gnz_test.test_genezio_deploy(configuration)
    gnz_test.test_genezio_remote_call(NODE_FILENAME)

    # Retrieve project id after deployment
    auth_token = get_auth_token()
    endpoint = 'https://dev.api.genez.io/projects?startIndex=0&projectsLimit=100'
    headers = {'Authorization': 'Bearer ' + auth_token}
    r = requests.get(endpoint, headers=headers)
    project_id = get_project_id(r.json()['projects'], configuration['name'], configuration['region'])

    gnz_test.test_genezio_delete(configuration, project_id)
    gnz_test.test_genezio_logout()
    print ("Success!")
