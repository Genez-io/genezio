import { OpenAI } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
    ENVIRONMENT_ANALYZE_PROMPT,
    INJECT_SERVICES,
    SYSTEM_ENVIRONMENT_ANALYZE_PROMPT,
} from "./constants.js";
import { debugLogger } from "../../utils/logging.js";
import { YAMLService } from "../../projectConfiguration/yaml/v2.js";

// Warning: Changing this type will break compatibility across the codebase
// Specifically, it is used in the dashboard to display the detected components
export interface ProjectEnvironment {
    key: string;
    defaultValue: string;
    genezioProvisioned: boolean;
    aboveComment?: string;
    link?: string;
}

export const ProjectEnvironmentSchema = z.object({
    environment: z.array(
        z.object({
            key: z.string(),
            defaultValue: z.string(),
            genezioProvisioned: z.boolean(),
            aboveComment: z.string().optional(),
            link: z.string().optional(),
        }),
    ),
});

export async function analyzeEnvironmentVariableExampleFile(
    contents: string,
    services?: YAMLService,
): Promise<ProjectEnvironment[]> {
    if (!process.env["OPENAI_API_KEY"]) {
        debugLogger.debug("No OpenAI API key found. Set OPENAI_API_KEY to enable analyze agent.");
        return [];
    }

    try {
        const openai = new OpenAI({
            apiKey: process.env["OPENAI_API_KEY"],
        });

        // Services might not be provided, so we need to check if it's available
        const injectedServices = services
            ? INJECT_SERVICES.replace("{{services}}", JSON.stringify(services))
            : undefined;
        const prompt = ENVIRONMENT_ANALYZE_PROMPT.replace(
            "{{injectedServices}}",
            injectedServices || "",
        ).replace("{{contents}}", contents);

        const completion = await openai.beta.chat.completions.parse({
            model: "gpt-4o",
            messages: [
                { role: "system", content: SYSTEM_ENVIRONMENT_ANALYZE_PROMPT },
                { role: "user", content: prompt },
            ],
            response_format: zodResponseFormat(ProjectEnvironmentSchema, "json_schema"),
        });

        if (completion.choices[0]?.message?.refusal) {
            debugLogger.debug("OpenAI refused to provide a response");
            return [];
        }

        // Parse and return the response
        const answer = completion?.choices?.[0]?.message;
        if (answer?.parsed) {
            return answer.parsed.environment;
        } else {
            debugLogger.debug("No parsed response from OpenAI");
            return [];
        }
    } catch (error) {
        debugLogger.error("Error analyzing backend env example file", error);
        return [];
    }
}
