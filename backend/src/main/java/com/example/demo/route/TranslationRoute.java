package com.example.demo.route;

import com.example.demo.dto.TranslationRequest;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.dataformat.JsonLibrary;
import org.springframework.stereotype.Component;

@Component
public class TranslationRoute extends RouteBuilder {

    @Override
    public void configure() {
        onException(Exception.class)
                .handled(true)
                .log("ERROR Translation failed: ${exception.message}")
                .setBody(simple("{\"error\": true, \"message\": \"${exception.message}\"}"))
                .setHeader("CamelJmsDestinationReply", simple("${header.JMSReplyTo}"));

        from("jms:queue:translation.requests?concurrentConsumers=3")
                .routeId("translation-pipeline")
                .log("Processing translation request: ${body}")
                .unmarshal().json(JsonLibrary.Jackson, TranslationRequest.class)
                .bean("messageBoardService", "performTranslation")
                .marshal().json(JsonLibrary.Jackson);
    }
}
