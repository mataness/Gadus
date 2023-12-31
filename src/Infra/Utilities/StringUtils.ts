import * as crypto from "crypto";

export class StringUtils {
    public static hash(str : string) {
        return crypto.createHash('md5').update(str).digest('hex');
    }
}