package com.example.demo.route;

import com.example.demo.dto.TranslationRequest;
import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.dataformat.JsonLibrary;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class TranslationRoute extends RouteBuilder {

    @Override
    public void configure() {
        onException(Exception.class)
                .handled(true)
                .log("ERROR Translation failed: ${exception.message}")
                .process(exchange -> {
                    String msg = exchange.getProperty(Exchange.EXCEPTION_CAUGHT, Exception.class).getMessage();
                    if (msg == null) msg = "unknown error";
                    msg = msg.replace("\"", "'");
                    exchange.getIn().setBody(Map.of("error", true, "message", msg));
                })
                .marshal().json(JsonLibrary.Jackson);

        from("jms:queue:translation.requests?concurrentConsumers=3")
                .routeId("translation-pipeline")
                .log("Processing translation request: ${body}")
                .unmarshal().json(JsonLibrary.Jackson, TranslationRequest.class)
                .bean("messageBoardService", "performTranslation")
                .marshal().json(JsonLibrary.Jackson);
    }
}
