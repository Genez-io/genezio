import net from "net";

export function findAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on("error", reject);
        server.listen(0, () => {
            const address: net.AddressInfo = server.address() as net.AddressInfo;
            server.on("close", resolve.bind(null, address.port));
            server.close();
        });
    });
}
