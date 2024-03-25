export type MethodDecoratorInfo = {
    name: string;
    arguments?: { [key: string]: string };
};

export type MethodInfo = {
    name: string;
    decorators: MethodDecoratorInfo[];
};

export type ClassDecoratorInfo = {
    name: string;
    arguments?: { [key: string]: string };
};

export type ClassInfo = {
    path: string;
    name: string;
    decorators: ClassDecoratorInfo[];
    methods: MethodInfo[];
};
