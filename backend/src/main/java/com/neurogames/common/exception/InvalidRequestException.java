package com.neurogames.common.exception;

/** A well-formed request that still violates a business rule (e.g. using an unapproved question). */
public class InvalidRequestException extends RuntimeException {

    public InvalidRequestException(String message) {
        super(message);
    }
}
