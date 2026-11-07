package com.neurogames.storage;

/** Supabase Storage rejected or failed a request; surfaced to clients as 502. */
public class StorageException extends RuntimeException {

    public StorageException(String message) {
        super(message);
    }

    public StorageException(String message, Throwable cause) {
        super(message, cause);
    }
}
