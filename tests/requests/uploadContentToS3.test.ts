import { getAuthToken } from "../../src/utils/accounts";
import { uploadContentToS3 } from "../../src/requests/uploadContentToS3";

jest.mock("../../src/utils/accounts");

const mockedGetAuthToken = jest.mocked(getAuthToken, { shallow: true });

beforeEach(() => {
    mockedGetAuthToken.mockClear();
});

test("should throw error if presigned URL is missing", async () => {
    await expect(async () => {
        await uploadContentToS3("", "test.zip");
    }).rejects.toThrowError();
});

test("should throw error if archive path is missing", async () => {
    await expect(async () => {
        await uploadContentToS3("https://test.com", "");
    }).rejects.toThrowError();
});

test("should throw error if auth token is missing", async () => {
    await expect(async () => {
        mockedGetAuthToken.mockResolvedValue("");

        await uploadContentToS3("https://test.com", "test.zip");
    }).rejects.toThrowError();
});
