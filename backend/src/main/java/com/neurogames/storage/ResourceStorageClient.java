package com.neurogames.storage;

import com.neurogames.config.StorageProperties;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Talks to the Supabase Storage REST API for the collection-resources bucket.
 * Object paths must already be URL-safe (see MaterialService#storagePath), so
 * they are used verbatim in request URLs.
 *
 * Every call is made as the teacher (their Supabase access token), never with
 * a service-role key: the bucket's RLS policies only let a teacher read and
 * write objects under their own collections' folders, so storage enforces
 * ownership even if this backend's own checks were bypassed.
 */
@Component
public class ResourceStorageClient {

    private final RestClient restClient;
    private final StorageProperties properties;

    public ResourceStorageClient(StorageProperties properties) {
        this.properties = properties;
        // RestClient.builder() rather than an injected Builder: Spring Boot 4
        // only auto-configures that bean with the separate restclient starter.
        this.restClient = RestClient.builder()
                .baseUrl(properties.url())
                .defaultHeader("apikey", properties.publishableKey())
                .build();
    }

    /**
     * A one-time URL the browser can PUT the file to directly. Files go
     * straight to storage because Vercel Functions cap request bodies at
     * 4.5 MB; signing still runs as the teacher, so the insert policy applies.
     */
    public URI createSignedUploadUrl(String userToken, String path) {
        try {
            SignedUploadUrlResponse response = restClient.post()
                    .uri("/object/upload/sign/{bucket}/" + path, properties.bucket())
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken)
                    .retrieve()
                    .body(SignedUploadUrlResponse.class);
            if (response == null || response.url() == null) {
                throw new StorageException("Storage returned no upload URL");
            }
            // url is relative to the storage API root, e.g. "/object/upload/sign/<bucket>/<path>?token=…"
            return URI.create(properties.url() + response.url());
        } catch (RestClientException ex) {
            throw new StorageException("Couldn't prepare the file upload", ex);
        }
    }

    public byte[] download(String userToken, String path) {
        try {
            byte[] content = restClient.get()
                    .uri("/object/authenticated/{bucket}/" + path, properties.bucket())
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken)
                    .retrieve()
                    .body(byte[].class);
            return content == null ? new byte[0] : content;
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 400 || ex.getStatusCode().value() == 404) {
                throw new StoredObjectNotFoundException();
            }
            throw new StorageException("Couldn't read the uploaded file", ex);
        } catch (RestClientException ex) {
            throw new StorageException("Couldn't read the uploaded file", ex);
        }
    }

    /** A time-limited URL anyone holding it can download the object from. */
    public URI createSignedUrl(String userToken, String path) {
        Duration ttl = properties.signedUrlTtl();
        try {
            SignedUrlResponse response = restClient.post()
                    .uri("/object/sign/{bucket}/" + path, properties.bucket())
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("expiresIn", ttl.toSeconds()))
                    .retrieve()
                    .body(SignedUrlResponse.class);
            if (response == null || response.signedURL() == null) {
                throw new StorageException("Storage returned no signed URL");
            }
            // signedURL is relative to the storage API root, e.g. "/object/sign/<bucket>/<path>?token=…"
            return URI.create(properties.url() + response.signedURL());
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 400 || ex.getStatusCode().value() == 404) {
                throw new StoredObjectNotFoundException();
            }
            throw new StorageException("Couldn't create a download link", ex);
        } catch (RestClientException ex) {
            throw new StorageException("Couldn't create a download link", ex);
        }
    }

    /** Best-effort cleanup; failures are swallowed so they never mask the original error. */
    public void deleteQuietly(String userToken, String path) {
        try {
            restClient.delete()
                    .uri("/object/{bucket}/" + path, properties.bucket())
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + userToken)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException ignored) {
            // orphaned object; nothing else to do
        }
    }

    private record SignedUrlResponse(String signedURL) {
    }

    private record SignedUploadUrlResponse(String url) {
    }

    /** The object doesn't exist (Supabase answers 400 "Object not found" for signing and reads). */
    public static class StoredObjectNotFoundException extends RuntimeException {
    }
}
