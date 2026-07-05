package com.example.ollama;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Minimal Java client for Ollama's /api/chat endpoint.
 * - Supports sync and streaming
 * - Manages message history
 */
public class OllamaClient {

    private final String baseUrl;
    private final String model;
    private final HttpClient httpClient;
    private final ObjectMapper mapper;

    private final List<Message> history = new ArrayList<>();

    public OllamaClient(String baseUrl, String model) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.model = model;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        this.mapper = new ObjectMapper();
    }

    // ----- Public API --------------------------------------------------------

    public void addSystemMessage(String content) {
        history.add(new Message("system", content));
    }

    public void addUserMessage(String content) {
        history.add(new Message("user", content));
    }

    public void clearHistory() {
        history.clear();
    }

    /**
     * Synchronous chat call (non-streaming).
     */
    public String chatOnce(String userPrompt) throws IOException, InterruptedException {
        addUserMessage(userPrompt);

        ChatRequest payload = new ChatRequest();
        payload.setModel(model);
        payload.setMessages(history);
        payload.setStream(false);
        payload.setOptions(Map.of(
                "num_ctx", 2048,
                "keep_alive", "5m"
        ));

        String body = mapper.writeValueAsString(payload);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/chat"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() != 200) {
            throw new IOException("Ollama error: " + response.statusCode() + " - " + response.body());
        }

        ChatResponse chatResponse = mapper.readValue(response.body(), ChatResponse.class);

        String assistantText = chatResponse.getMessage() != null ? chatResponse.getMessage().getContent() : "";
        history.add(new Message("assistant", assistantText));
        return assistantText;
    }

    /**
     * Streaming chat call. Calls onToken.accept(tokenText) for each chunk.
     */
    public void chatStream(String userPrompt, Consumer<String> onToken) throws IOException {
        addUserMessage(userPrompt);

        ChatRequest payload = new ChatRequest();
        payload.setModel(model);
        payload.setMessages(history);
        payload.setStream(true);
        payload.setOptions(Map.of(
                "num_ctx", 2048,
                "keep_alive", "5m"
        ));

        String body = mapper.writeValueAsString(payload);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/chat"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofLines())
                .thenAccept(resp -> {
                    StringBuilder full = new StringBuilder();
                    resp.body().forEach(line -> {
                        if (line == null || line.isBlank()) return;
                        try {
                            ChatResponse chunk = mapper.readValue(line, ChatResponse.class);
                            if (chunk.getMessage() != null && chunk.getMessage().getContent() != null) {
                                String token = chunk.getMessage().getContent();
                                full.append(token);
                                onToken.accept(token);
                            }
                        } catch (JsonProcessingException e) {
                            // ignore malformed chunk
                        }
                    });
                    history.add(new Message("assistant", full.toString()));
                })
                .exceptionally(ex -> {
                    ex.printStackTrace();
                    return null;
                });
    }

    // ----- DTOs --------------------------------------------------------------

    public static class Message {
        private String role;
        private String content;

        public Message() {}

        public Message(String role, String content) {
            this.role = role;
            this.content = content;
        }

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }

        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
    }

    public static class ChatRequest {
        private String model;
        private List<Message> messages;
        private boolean stream;
        private Map<String, Object> options;

        public String getModel() { return model; }
        public void setModel(String model) { this.model = model; }

        public List<Message> getMessages() { return messages; }
        public void setMessages(List<Message> messages) { this.messages = messages; }

        public boolean isStream() { return stream; }
        public void setStream(boolean stream) { this.stream = stream; }

        public Map<String, Object> getOptions() { return options; }
        public void setOptions(Map<String, Object> options) { this.options = options; }
    }

    public static class ChatResponse {
        private Message message;
        private boolean done;

        public Message getMessage() { return message; }
        public void setMessage(Message message) { this.message = message; }

        public boolean isDone() { return done; }
        public void setDone(boolean done) { this.done = done; }
    }

    // ----- Demo main ---------------------------------------------------------

    public static void main(String[] args) throws Exception {
        OllamaClient client = new OllamaClient("http://localhost:11434", "llama3.2:3b");

        client.addSystemMessage("You are a helpful Java assistant.");

        // Sync example
        String answer = client.chatOnce("Explain Java records in one paragraph.");
        System.out.println("SYNC:\n" + answer);

        // Streaming example
        System.out.println("\nSTREAMING:");
        client.chatStream("Give me a bullet list of Java best practices.", token -> {
            System.out.print(token);
        });

        // Keep JVM alive briefly for async streaming
        Thread.sleep(5000);
    }
}
