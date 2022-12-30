export function parse(source: string) {
  const json = JSON.parse(source);
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('Expected the file to contain a JSON object (not array)');
  }

  return Object.entries(json).map(([objectKey, objectValue]) => {
    const valueType = typeof objectValue;
    if (valueType !== 'string' && valueType !== 'object') {
      throw new Error(`Expected the value for key "${objectKey}" to be a string or object, got ${valueType}`);
    }

    const key = objectKey;

    let value: string;
    let additionalFields: Array<{ fieldName: string; value: string; uiHidden: boolean }> = [];
    
    if (typeof objectValue === 'string') {
      value = objectValue;
    } else {
      value = (objectValue as any).string;
      if (typeof value !== 'string') {
        throw new Error(`Expected the value for key '${objectKey}' to be a string or object with a string property named "string".`);
      }

      additionalFields = Object.entries(objectValue as any)
        .filter(([key]) => key !== 'string')
        .map(([key, value]) => {
          if (typeof value !== 'string') {
            throw new Error(`Additional property '${key}' for key '${objectKey}' must be a string, got ${typeof value}.`);
          }

          return ({
            fieldName: key,
            value,
            uiHidden: false
          });
        });
    }

    return { key, value, additionalFields };
  });
}

export function serialize(strings: Array<{ key: string; value: string; }>) {
  const obj = Object.fromEntries(strings.map(({ key, value }) => [key, value]));
  return JSON.stringify(obj, null, 2);
}
