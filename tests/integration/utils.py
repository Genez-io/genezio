#!/usr/bin/python3

import yaml
import json
from os.path import expanduser
from termcolor import colored

def read_config_file_to_json():
    with open('genezio.yaml') as file:
        configuration = yaml.safe_load(file)
    return json.loads(json.dumps(configuration))

def get_auth_token():
    home = expanduser('~')
    with open(home + '/' + '.geneziorc') as file:
        return file.read().rstrip()

def get_project_id(projects, name, region):
    for project in projects:
        if project['name'] == name and project['region'] == region:
            return project['id']
    return ""

def contains_project(projects, name, region):
    for project in projects:
        if project['name'] == name and project['region'] == region:
            return True
    return False

def assert_log(condition, process, description = "N/A"):
    assert condition, colored("Test for " + str(process.args) + " failed\nDescription: " + description + "\nstderr: " + process.stderr, "red")
