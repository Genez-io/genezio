import Docker, { Container } from "dockerode";
import { printAdaptiveLog } from "./logging.js";
import log from "loglevel";
import { YamlDatabaseConfiguration } from "../models/yamlProjectConfiguration.js";
import { getProjectConfiguration } from "./configuration.js";

export async function runDockerDatabaseContainer(
    dockerHandler: Docker,
    databaseType: string,
    projectName: string,
) {
    const containerName = `/genezio-${databaseType}-${projectName}`;
    let currentContainer: Container | undefined;
    try {
        const containers = await dockerHandler.listContainers({ all: true });
        containers.forEach(function (container) {
            if (container.Names[0] == containerName) {
                currentContainer = dockerHandler.getContainer(container.Id);
            }
        });
    } catch (error) {
        printAdaptiveLog(`Failed starting local docker ${databaseType} database`, "");
        if (error instanceof Error) {
            log.error(`An error has occured: ${error.toString()}`);
        }
        log.error(
            "This is most likely a docker error, check if your docker daemon is running.\nIf it is not running you can learn how to start it by going to the docker documentation at https://docs.docker.com/ ",
        );
        return undefined;
    }
    if (currentContainer) {
        const inspectRes = await currentContainer.inspect();
        const isContainerRunning = inspectRes.State.Running;
        if (!isContainerRunning) {
            try {
                await currentContainer.start();
                printAdaptiveLog(`Completed starting local docker ${databaseType} database`, "end");
            } catch (error) {
                printAdaptiveLog(`Failed starting local docker ${databaseType} database`, "");
                if (error instanceof Error) {
                    log.error(`An error has occured: ${error.toString()}`);
                }
                return undefined;
            }
        }
    } else {
        try {
            switch (databaseType) {
                case "postgres": {
                    let isImagePresent = false;
                    const images = await dockerHandler.listImages({ all: true });
                    images.forEach(function (image) {
                        if (image.RepoTags && image.RepoTags[0] == "postgres:latest") {
                            isImagePresent = true;
                        }
                    });
                    if (!isImagePresent) {
                        const pullStream = await dockerHandler.pull("postgres");
                        await new Promise((res) =>
                            dockerHandler.modem.followProgress(pullStream, res),
                        );
                    }
                    const newContainer = await dockerHandler.createContainer({
                        Image: "postgres",
                        Env: [`POSTGRES_PASSWORD=mysecretpassword`],
                        HostConfig: {
                            PortBindings: {
                                "5432/tcp": [{ HostPort: "5432" }],
                            },
                            Binds: ["/root/dir:/tmp"],
                        },
                        ExposedPorts: {
                            "5432/tcp": {},
                        },
                        name: containerName,
                    });
                    await newContainer.start();
                    printAdaptiveLog(
                        `Completed starting local docker ${databaseType} database`,
                        "end",
                    );
                    log.info(
                        `Your local postgres database is up and running.\nYou can connect to your postgres instance using the following URL: at postgres://postgres:mysecretpassword@localhost:5432`,
                    );

                    break;
                }
                case "redis": {
                    let isImagePresent = false;
                    const images = await dockerHandler.listImages({ all: true });
                    images.forEach(function (image) {
                        if (image.RepoTags && image.RepoTags[0] == "redis:latest") {
                            isImagePresent = true;
                        }
                    });
                    if (!isImagePresent) {
                        const pullStream = await dockerHandler.pull("redis");
                        await new Promise((res) =>
                            dockerHandler.modem.followProgress(pullStream, res),
                        );
                    }
                    const newContainer = await dockerHandler.createContainer({
                        Image: "redis",
                        HostConfig: {
                            PortBindings: {
                                "6379/tcp": [{ HostPort: "6379" }],
                            },
                            Binds: ["/root/dir:/tmp"],
                        },
                        ExposedPorts: {
                            "6379/tcp": {},
                        },
                        name: containerName,
                    });
                    await newContainer.start();
                    printAdaptiveLog(
                        `Completed starting local docker ${databaseType} database`,
                        "end",
                    );
                    log.info(
                        `Your local redis database is up and running.\nYou can connect to the your redis instance using the following URL: redis://localhost:6379`,
                    );
                    break;
                }
                default: {
                    await stopDockerDatabase();
                    printAdaptiveLog(`Failed starting local docker ${databaseType} database`, "");
                    log.error(
                        "Unsupported database type, please use one of the following types of databases if you want to have a local testing db: [`postgres`,`redis`]",
                    );
                    break;
                }
            }
        } catch (error) {
            printAdaptiveLog(`Failed starting local docker ${databaseType} database`, "");
            if (error instanceof Error) {
                log.error(`An error has occured: ${error.toString()}`);
            }
            return undefined;
        }
    }
}

export async function startDockerDatabase(
    database: YamlDatabaseConfiguration,
    projectName: string,
) {
    let docker: Docker;
    try {
        docker = new Docker();
    } catch (error) {
        if (error instanceof Error) {
            log.error("An error has occured: ", error.toString());
        }
        log.error(
            "\x1b[33m%s\x1b[0m",
            "Docker not found, if you want to have a local database for testing, you need to install docker. Go to https://www.docker.com/products/docker-desktop/ to install docker",
        );
        printAdaptiveLog(`Failed starting local docker ${database.type} database`, "");
        return undefined;
    }
    await runDockerDatabaseContainer(docker, database.type, projectName);
}

export async function stopDockerDatabaseContainer(
    dockerHandler: Docker,
    databaseType: string,
    projectName: string,
) {
    const containerName = `/genezio-${databaseType}-${projectName}`;
    let currentContainer: Container | undefined;
    try {
        const containers = await dockerHandler.listContainers({ all: true });
        containers.forEach(function (container) {
            if (container.Names[0] == containerName) {
                currentContainer = dockerHandler.getContainer(container.Id);
            }
        });
    } catch (error) {
        printAdaptiveLog(`Failed starting local docker ${databaseType} database`, "");
        if (error instanceof Error) {
            log.error("An error has occured: ", error.toString());
        }
        log.error(
            "This is most likely a docker error, check if your docker daemon is running.\nIf it is not running you can learn how to start it by going to the docker documentation at https://docs.docker.com/ ",
        );
        return undefined;
    }
    if (currentContainer) {
        const inspectRes = await currentContainer.inspect();
        const isContainerRunning = inspectRes.State.Running;
        if (isContainerRunning) {
            try {
                await currentContainer.stop();
            } catch (error) {
                if (error instanceof Error) {
                    log.error("An error has occured: ", error.toString());
                }
                return undefined;
            }
        }
    }
}

export async function stopDockerDatabase() {
    const yamlProjectConfiguration = await getProjectConfiguration();
    if (yamlProjectConfiguration.database?.type) {
        let docker;
        try {
            docker = new Docker();
        } catch (error) {
            if (error instanceof Error) {
                log.error("An error has occured: ", error.toString());
            }
            log.error(
                "\x1b[33m%s\x1b[0m",
                "Docker not found, if you want to have a local database for testing, you need to install docker. Go to https://www.docker.com/products/docker-desktop/ to install docker",
            );
            return undefined;
        }

        await stopDockerDatabaseContainer(docker, "postgres", yamlProjectConfiguration.name);
        await stopDockerDatabaseContainer(docker, "redis", yamlProjectConfiguration.name);
    }
}
