import { execSync } from "child_process";

export function checkIfKotlinReqsAreInstalled() {
    const JavaNotFoundError = `Error: Java not found`;
    const KotlinNotFoundError = `Error: Kotlin not found! See https://kotlinlang.org/docs/command-line.html for installation instructions`;
    const GradleNotFoundError =
        "Error: Gradle not found! See https://gradle.org/install/ for installation instructions";

    // Check java version
    try {
        execSync("javac -version");
    } catch (error) {
        const java_err = new Error(JavaNotFoundError);
        java_err.stack = "";
        throw java_err;
    }

    // Check kotlin version
    try {
        execSync("kotlin -version");
    } catch (error) {
        const kotlin_err = new Error(KotlinNotFoundError);
        kotlin_err.stack = "";
        throw kotlin_err;
    }

    // Check gradle version
    try {
        execSync("gradle -version");
    } catch (error) {
        const gradle_err = new Error(GradleNotFoundError);
        gradle_err.stack = "";
        throw gradle_err;
    }
}
