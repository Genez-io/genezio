export default function () {
    return {
        name: "strip-decorators",
        visitor: {
            Decorator(path: any) {
                path.remove();
            },
        },
    };
}
