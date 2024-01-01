export function groupBy<T>(list: T[], keyGetter: (item: T) => any) : any {
    const map = new Map();
    list.forEach((item) => {
        const key = keyGetter(item);
        const collection = map.get(key);
        if (!collection) {
            map.set(key, [item]);
        } else {
            collection.push(item);
        }
    });
    return map;
}

export function distinctArray<T>(values: T[]) : T[]{
    return [...new Set(values)];
}