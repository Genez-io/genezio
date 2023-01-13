# End-to-End tests documentation

The end-to-end tests are used only for `dev` environment for now.

To run the test, we need to mock `genezio login` within the Docker containers:
- For local testing, the developer should set GENEZIO_TOKEN accordingly before starting the tests.

## Test locally

To test locally, run:
```bash
export GENEZIO_TOKEN=$(cat ~/.geneziorc)

# Optional: To test only specific examples, redefine TEST_LIST:
export TEST_LIST="test_cron.py test_hello.py"

# The Docker context is build from the local project files.
docker-compose up --force-recreate --abort-on-container-exit --exit-code-from genezio
```

## Warnings
- Running the docker-compose file will deploy the projects defined by TEST_LIST in the genezio account referenced by the GENEZIO_TOKEN
- Often the tests are introducing side-effects such as: logging out, creating/deleting files, creating/deleting projects.
