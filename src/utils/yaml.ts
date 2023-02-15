import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';


export function generateRandomSubdomain(): string {
  const name: string = uniqueNamesGenerator({
    dictionaries: [colors, adjectives, animals],
    separator: '-',
    style: 'lowerCase',
    length: 3,
  });

  return name;
}