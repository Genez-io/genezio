

export const FULLSTACK_TEMPLATE_GIT_URL = "https://github.com/Genez-io/hello-world-fullstack-react-template";
export const BACKEND_TEMPLATE_GIT_URL = "https://github.com/Genez-io/hello-world-backend-template";


export const newClassTemplateNode = (className: string) => `import { GenezioDeploy } from "@genezio/types";

/**
 * This class can be deployed on genezio infrastructure
 * using "genezio deploy" command or tested locally using "genezio local".
 */
@GenezioDeploy()
export class ${className} {
}
`;