import { v2 as cloudinary } from "cloudinary";
import { ValidationError } from "../types/app-error.js";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET ?? "bookllm";
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

export type CloudinaryUploadResult = {
    secureUrl: string;
    publicId: string;
    bytes: number;
    originalFilename: string;
    resourceType: "raw" | "image";
};

type CloudinaryUploadResponse = {
    secure_url: string;
    public_id: string;
    bytes: number;
    resource_type?: string;
    error?: { message: string };
};

function configureCloudinary() {
    if (!cloudName || !apiKey || !apiSecret) {
        return false;
    }

    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
    });

    return true;
}

export function getSignedCloudinaryDownloadUrl(
    publicId: string,
    resourceType: "raw" | "image" = "raw",
) {
    if (!configureCloudinary()) {
        return null;
    }

    return cloudinary.url(publicId, {
        resource_type: resourceType,
        type: "upload",
        sign_url: true,
        secure: true,
    });
}

type CloudinaryError = {
    message?: string;
    http_code?: number;
    name?: string;
};

function toUploadError(error: unknown): ValidationError {
    const cloudinaryError = error as CloudinaryError;

    if (
        cloudinaryError.http_code === 403 ||
        cloudinaryError.name === "UnexpectedResponse"
    ) {
        return new ValidationError(
            "Cloudinary rejected the upload: your API key is missing Upload permission. In Cloudinary Dashboard → Settings → API Keys, use the main API secret or create a key with Upload enabled.",
        );
    }

    if (cloudinaryError.message) {
        return new ValidationError(cloudinaryError.message);
    }

    return new ValidationError("Cloudinary upload failed");
}

async function signedUpload(
    buffer: Buffer,
    filename: string,
): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                resource_type: "raw",
                folder: "chaibook/pdfs",
            },
            (error, result) => {
                if (error || !result) {
                    reject(toUploadError(error));
                    return;
                }

                resolve({
                    secureUrl: result.secure_url,
                    publicId: result.public_id,
                    bytes: result.bytes,
                    originalFilename: filename,
                    resourceType:
                        result.resource_type === "image" ? "image" : "raw",
                });
            },
        );

        stream.end(buffer);
    });
}

async function unsignedUpload(
    buffer: Buffer,
    filename: string,
): Promise<CloudinaryUploadResult> {
    const form = new FormData();
    form.append(
        "file",
        new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
        filename,
    );
    form.append("upload_preset", uploadPreset);
    form.append("folder", "bookllm/pdfs");

    const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
        { method: "POST", body: form },
    );

    const result = (await response.json()) as CloudinaryUploadResponse;

    if (!response.ok) {
        const message =
            result.error?.message ??
            `Cloudinary upload failed (${response.status})`;

        if (response.status === 403) {
            throw new ValidationError(
                "Cloudinary rejected the upload. Add CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to server/.env, or create an unsigned upload preset named in CLOUDINARY_UPLOAD_PRESET.",
            );
        }

        throw new ValidationError(message);
    }

    return {
        secureUrl: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
        originalFilename: filename,
        resourceType: result.resource_type === "image" ? "image" : "raw",
    };
}

export async function uploadPdfToCloudinary(
    buffer: Buffer,
    filename: string,
): Promise<CloudinaryUploadResult> {
    if (!cloudName) {
        throw new ValidationError("Cloudinary is not configured on the server");
    }

    if (configureCloudinary()) {
        return signedUpload(buffer, filename);
    }

    return unsignedUpload(buffer, filename);
}
