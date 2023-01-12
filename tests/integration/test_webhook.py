#!/usr/bin/python3

import os
import requests
import test as gnz_test
import requests
from utils import get_auth_token, get_project_id, read_config_file_to_json


NODE_FILENAME = "../client/test-webhook-sdk.js"

if __name__ == '__main__':
    print("Starting webhook test...")
    os.chdir("../../examples/webhook/server")
    configuration = read_config_file_to_json()
    print("Succesfully read `genezio.yaml`")
    
    gnz_test.test_genezio_account()
    gnz_test.test_genezio_deploy("../client/sdk/")
    gnz_test.test_genezio_deploy(configuration)

    response = requests.get('http://127.0.0.1:8083/HelloWorldCronExample/handleQueryParams?name=john')
    print(response.text)

    # Retrieve project id after deployment
    auth_token = get_auth_token()
    endpoint = 'https://dev.api.genez.io/projects?startIndex=0&projectsLimit=100'
    headers = {'Authorization': 'Bearer ' + auth_token}
    r = requests.get(endpoint, headers=headers)
    project_id = get_project_id(r.json()['projects'], configuration['name'], configuration['region'])

    gnz_test.test_genezio_delete(configuration, project_id)

    print("Success!")
