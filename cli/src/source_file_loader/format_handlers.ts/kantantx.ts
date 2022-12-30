export function parse(source: string): any {
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
    const value = typeof objectValue === 'string' ? objectValue : (objectValue as any).string;
    const comment = (objectValue as any).comment;
  });
}

export function serialize(strings: Array<{ key: string; value: string; comment?: string }>) {

}
