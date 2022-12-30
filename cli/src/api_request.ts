import fetch from 'node-fetch';

export class APIRequest {
  constructor(private readonly baseUri: string, private readonly apiKey?: string) {}

  private async doRequest<TReturnType>(relativePath: string, method: string, body?: object): Promise<
    { success: true; responseBody: TReturnType } | { success: false; status: number; responseBody: object; }
  > {
    const headers = {
      'Content-Type': "application/json",
      'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
    };

    const response = await fetch(`${this.baseUri}/api/v1${relativePath}`, {
      method,
      headers,
      body: body && JSON.stringify(body),
    });

    const responseBody = await response.json();

    return {
      success: response.ok,
      status: response.status,
      responseBody,
    };
  }

  public doGetRequest<TReturnType>(relativePath: string) {
    return this.doRequest<TReturnType>(relativePath, 'GET');
  }

  public doPutRequest<TReturnType>(relativePath: string, body: object) {
    return this.doRequest<TReturnType>(relativePath, 'PUT', body);
  }

  public doPostRequest<TReturnType>(relativePath: string, body: object) {
    return this.doRequest<TReturnType>(relativePath, 'POST', body);
  }

  public doPatchRequest<TReturnType>(relativePath: string, body: object) {
    return this.doRequest<TReturnType>(relativePath, 'PATCH', body);
  }
}
