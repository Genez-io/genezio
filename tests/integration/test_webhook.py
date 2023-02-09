#!/usr/bin/python3

import os
import requests
import test as gnz_test
import requests
import json
from termcolor import colored
from utils import get_auth_token, get_project_id, read_config_file_to_json


NODE_FILENAME = "../client/test-webhook-sdk.js"

def testSuccessQueryParamsRequest(deployed_urls):
    localResponse = requests.get('http://127.0.0.1:8083/HelloWorldHttpExample/handleQueryParams?name=john')
    remoteResponse = requests.get(deployed_urls["HelloWorldHttpExample.handleQueryParams"] + '/HelloWorldHttpExample/handleQueryParams?name=john')

    assert localResponse.text == remoteResponse.text
    assert localResponse.status_code == remoteResponse.status_code
    assert localResponse.headers["content-type"] == remoteResponse.headers["content-type"]
    print(colored("Test testSuccessQueryParamsRequest passed", "green"))

def testFailQueryParamsRequest(deployed_urls):
    localResponse = requests.get('http://127.0.0.1:8083/HelloWorldHttpExample/handleQueryParams')
    remoteResponse = requests.get(deployed_urls["HelloWorldHttpExample.handleQueryParams"] + '/HelloWorldHttpExample/handleQueryParams')

    assert localResponse.text == remoteResponse.text
    assert localResponse.status_code == remoteResponse.status_code
    assert localResponse.headers["content-type"] == remoteResponse.headers["content-type"]
    print(colored("Test testFailQueryParamsRequest passed", "green"))

def testSuccessHandleSimpleTextRequest(deployed_urls):
    localResponse = requests.post('http://127.0.0.1:8083/HelloWorldHttpExample/handleSimpleTextRequest', data="hello")
    remoteResponse = requests.post(deployed_urls["HelloWorldHttpExample.handleSimpleTextRequest"] + '/HelloWorldHttpExample/handleSimpleTextRequest', data="hello")

    assert localResponse.text == remoteResponse.text
    assert localResponse.status_code == remoteResponse.status_code
    assert localResponse.headers["content-type"] == remoteResponse.headers["content-type"]
    print(colored("Test testSuccessHandleSimpleTextRequest passed", "green"))

def testEmptyHandleSimpleTextRequest(deployed_urls):
    localResponse = requests.post('http://127.0.0.1:8083/HelloWorldHttpExample/handleSimpleTextRequest')
    remoteResponse = requests.post(deployed_urls["HelloWorldHttpExample.handleSimpleTextRequest"] + '/HelloWorldHttpExample/handleSimpleTextRequest')

    assert localResponse.text == remoteResponse.text
    assert localResponse.status_code == remoteResponse.status_code
    assert localResponse.headers["content-type"] == remoteResponse.headers["content-type"]
    print(colored("Test testEmptyHandleSimpleTextRequest passed", "green"))

def testSuccessHandleJsonBodyRequest(deployed_urls):
    localResponse = requests.post('http://127.0.0.1:8083/HelloWorldHttpExample/handleJsonBody', json={ 'name': 'world' })
    remoteResponse = requests.post(deployed_urls["HelloWorldHttpExample.handleJsonBody"] + '/HelloWorldHttpExample/handleJsonBody', json={ 'name': 'world' })
 
    assert json.dumps(localResponse.text) == json.dumps(remoteResponse.text)
    assert localResponse.status_code == remoteResponse.status_code
    assert localResponse.headers["content-type"] == remoteResponse.headers["content-type"]
    print(colored("Test testSuccessHandleJsonBodyRequest passed", "green"))

def testFailHandleJsonBodyRequest(deployed_urls):
    localResponse = requests.post('http://127.0.0.1:8083/HelloWorldHttpExample/handleJsonBody', json={ 'hello': 'world' })
    remoteResponse = requests.post(deployed_urls["HelloWorldHttpExample.handleJsonBody"] + '/HelloWorldHttpExample/handleJsonBody', json={ 'hello': 'world' })

    assert json.dumps(localResponse.text) == json.dumps(remoteResponse.text)
    assert localResponse.status_code == remoteResponse.status_code
    assert localResponse.headers["content-type"] == remoteResponse.headers["content-type"]
    print(colored("Test testFailHandleJsonBodyRequest passed", "green"))

def testSuccessHandleMultipartDataRequest(deployed_urls):
    multipart_form_data = {
        'myFile': (None, 'test')
    }

    localResponse = requests.post('http://127.0.0.1:8083/HelloWorldHttpExample/handleMultipartData', files=multipart_form_data)
    remoteResponse = requests.post(deployed_urls["HelloWorldHttpExample.handleMultipartData"] + '/HelloWorldHttpExample/handleMultipartData', files=multipart_form_data)

    assert localResponse.text == remoteResponse.text
    assert localResponse.status_code == remoteResponse.status_code
    assert localResponse.headers["content-type"] == remoteResponse.headers["content-type"]
    print(colored("Test testSuccessHandleMultipartDataRequest passed", "green"))

def testFailHandleMultipartDataRequest(deployed_urls):
    multipart_form_data = {
        'myOtherFile': (None, 'test')
    }

    localResponse = requests.post('http://127.0.0.1:8083/HelloWorldHttpExample/handleMultipartData', files=multipart_form_data)
    remoteResponse = requests.post(deployed_urls["HelloWorldHttpExample.handleMultipartData"] + '/HelloWorldHttpExample/handleMultipartData', files=multipart_form_data)

    assert localResponse.text == remoteResponse.text
    assert localResponse.status_code == remoteResponse.status_code
    assert localResponse.headers["content-type"] == remoteResponse.headers["content-type"]
    print(colored("Test testFailHandleMultipartDataRequest passed", "green"))

if __name__ == '__main__':
    # print("Starting webhook test...")
    os.chdir("../../examples/javascript/webhook/server")
    configuration = read_config_file_to_json()
    print("Succesfully read `genezio.yaml`")
    
    gnz_test.test_genezio_account()
    deployed_urls = gnz_test.test_genezio_deploy(configuration)

    process = gnz_test.start_genezio_local()

    testSuccessQueryParamsRequest(deployed_urls)
    testFailQueryParamsRequest(deployed_urls)
    testSuccessHandleSimpleTextRequest(deployed_urls)
    testEmptyHandleSimpleTextRequest(deployed_urls)
    testSuccessHandleJsonBodyRequest(deployed_urls)
    testFailHandleJsonBodyRequest(deployed_urls)
    testSuccessHandleMultipartDataRequest(deployed_urls)
    testFailHandleMultipartDataRequest(deployed_urls)

    process.terminate()
    process.wait()

    # Retrieve project id after deployment
    auth_token = get_auth_token()
    endpoint = 'https://dev.api.genez.io/projects?startIndex=0&projectsLimit=100'
    headers = {'Authorization': 'Bearer ' + auth_token}
    r = requests.get(endpoint, headers=headers)
    project_id = get_project_id(r.json()['projects'], configuration['name'], configuration['region'])

    gnz_test.test_genezio_delete(configuration, project_id)

    print("Success!")
