export const swiftSdk = `/**
 * This is an auto generated code. This code should not be modified since the file can be overwritten
 * if new genezio commands are executed.
 */

import Foundation

struct ResponseContent {
    var error: String? = nil
    var result: Any? = nil
}

class Remote {
    private var urlString: String? = nil

    init(url: String? = nil) {
        self.urlString = url
    }

    public func call(method: String, args: Any...) async -> Any {
        var argsArray: [Any] = []
        args.forEach { argsArray.append($0) }
        let requestContent: [String: Any] = [
            "jsonrpc": "2.0",
            "method": method,
            "params": argsArray,
            "id": 3
        ]

        let response = await makeRequest(requestContent: requestContent, urlString: urlString ?? "")
        if (response.error != nil) {
            return response.error ?? ""
        }
        return response.result ?? ""
    }

    private func makeRequest(requestContent: [String: Any], urlString: String) async -> ResponseContent {
        let url = URL(string: urlString)!
        let session = URLSession.shared

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: requestContent, options: .prettyPrinted)
        } catch let error {
            return ResponseContent(error: error.localizedDescription)
        }

        // make request with async await and return response
        do {
            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
                do {
                    let json = try JSONSerialization.jsonObject(with: data, options: [])
                    if let dictionary = json as? [String: Any] {
                        if let error = dictionary["error"] as? String {
                            return ResponseContent(error: error)
                        }
                    }
                } catch {
                    return ResponseContent(error: "JSON error: (error.localizedDescription)")
                }
                return ResponseContent(error: "Server error")
            }

            do {
                let json = try JSONSerialization.jsonObject(with: data, options: [])
                if let dictionary = json as? [String: Any] {
                    if let error = dictionary["error"] as? [String: Any] {
                        return ResponseContent(error: error["message"] as? String ?? "")
                    }
                    if let result = dictionary["result"] {
                        return ResponseContent(result: result)
                    }
                }
            } catch {
                return ResponseContent(error: "JSON error: (error.localizedDescription)")
            }
        } catch let error {
            return ResponseContent(error: error.localizedDescription)
        }
        return ResponseContent(error: "Unknown error")
    }
}
`;
