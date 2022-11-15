import axios from 'axios';
import { readToken } from "../../src/utils/file";
import { ClassConfiguration, TriggerType } from '../../src/models/projectConfiguration';
import { deployClass } from "../../src/requests/deployCode"

jest.mock('axios');
jest.mock("../../src/utils/file");

const mockedAxios = jest.mocked(axios, { shallow: true })
const mockedReadToken = jest.mocked(readToken, { shallow: true })

beforeEach(() => {
    mockedReadToken.mockClear()
})

test('should throw error if server returns error', async () => {
    await expect(async () => {
        const classConfiguration = new ClassConfiguration("./test", TriggerType.cron, "js", [])
        mockedReadToken.mockResolvedValue("token")
        mockedAxios.mockResolvedValue({ data: { status: "error" }, status: 200, statusText: "Ok", headers: {}, config: {} });

        await deployClass(classConfiguration, 'test', 'test', "test")
    }).rejects.toThrowError();
});

test('should throw error if server returns data.error object', async () => {
    await expect(async () => {
        const classConfiguration = new ClassConfiguration("./test", TriggerType.cron, "js", [])
        mockedReadToken.mockResolvedValue("token")
        mockedAxios.mockResolvedValue({ data: { error: { message: "error text" } }, status: 200, statusText: "Ok", headers: {}, config: {} });

        await deployClass(classConfiguration, 'test', 'test', "test")
    }).rejects.toThrowError();
});

test('should return response.data if everything is ok', async () => {
    const someObject = { someData: "data" }
    const classConfiguration = new ClassConfiguration("./test", TriggerType.cron, "js", [])
    mockedReadToken.mockResolvedValue("token")
    mockedAxios.mockResolvedValue({ data: someObject, status: 200, statusText: "Ok", headers: {}, config: {} });

    const response = await deployClass(classConfiguration, 'test', 'test', "test")
    expect(response).toEqual(someObject)
});

test('should read token and pass it to headers', async () => {
    const someObject = { someData: "data" }
    const classConfiguration = new ClassConfiguration("./test", TriggerType.cron, "js", [])
    mockedReadToken.mockResolvedValue("token")
    mockedAxios.mockResolvedValue({ data: someObject, status: 200, statusText: "Ok", headers: {}, config: {} });

    const response = await deployClass(classConfiguration, 'test', 'test', "test")

    expect(mockedReadToken.mock.calls.length).toBe(1)

    expect(response).toEqual(someObject)
});