export type MethodDecoratorInfo = {
    name: string;
    arguments?: { [key: string]: string | number };
};

export type MethodInfo = {
    name: string;
    decorators: MethodDecoratorInfo[];
};

export type ClassDecoratorInfo = {
    name: string;
    arguments?: { [key: string]: string | number | boolean };
};

export type ClassInfo = {
    path: string;
    name: string;
    decorators: ClassDecoratorInfo[];
    methods: MethodInfo[];
};
