/**
 * DeepRequired is a utility type that makes specified nested properties required in a defined type.
 *
 * @example
 * type Example = {
 *     a?: {
 *         b?: {
 *             c?: string;
 *         };
 *     };
 *     d?: number;
 * };
 *
 * type Result = DeepRequired<Example, 'a.b' | 'd'>;
 *
 * // Result is equal to:
 * // {
 * //    a?: {
 * //       b: {
 * //          c?: string;
 * //       };
 * //    };
 * //    d: number;
 * // }
 *
 * @template T - The type to make the specified nested properties required.
 * @template K - A string that represents the path to the nested property to make required, separated by `.`
 * @returns The type with the specified nested properties required.
 */
export type DeepRequired<T extends object, K extends NestedKeyOf<T>> = UnionToIntersection<
    RequiredUnion<T, K> | T
>;

type UnionToIntersection<U> = (U extends U ? (arg: U) => void : never) extends (
    arg: infer I,
) => void
    ? I
    : never;

/*
 * Dark magic code
 *
 * Increase the counter if you had to modify this code: 1
 */
type RequiredUnion<
    T,
    K extends string,
> = K extends `${infer KFirst extends Extract<keyof NonNullable<T>, string>}.${infer KRest extends string}`
    ? {
          [Key in KFirst]: Key extends keyof NonNullable<T>
              ? undefined extends NonNullable<T>[Key]
                  ? RequiredUnion<NonNullable<T>[Key], KRest> | undefined
                  : RequiredUnion<NonNullable<T>[Key], KRest>
              : never;
      }
    : K extends keyof NonNullable<T>
      ? undefined extends T
          ? { [Key in K]: NonNullable<NonNullable<T>[Key]> } | undefined
          : { [Key in K]: NonNullable<NonNullable<T>[Key]> }
      : never;

type NestedKeyOf<T extends object> = {
    [P in keyof T & (string | number)]: NonNullable<T[P]> extends object
        ? `${P}` | `${P}.${NestedKeyOf<NonNullable<T[P]>>}`
        : `${P}`;
}[keyof T & (string | number)];
