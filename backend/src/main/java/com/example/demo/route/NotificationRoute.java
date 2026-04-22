package com.example.demo.route;

import com.example.demo.dto.NotificationEvent;
import org.apache.camel.AggregationStrategy;
import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.dataformat.JsonLibrary;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class NotificationRoute extends RouteBuilder {

    @Override
    public void configure() {
        errorHandler(deadLetterChannel("jms:queue:notification.dlq")
                .maximumRedeliveries(3)
                .redeliveryDelay(1000)
                .useExponentialBackOff()
                .retryAttemptedLogLevel(org.apache.camel.LoggingLevel.WARN));

        from("jms:queue:message.notifications?concurrentConsumers=3")
                .routeId("notification-pipeline")
                .log("Processing notification: ${body}")
                .unmarshal().json(JsonLibrary.Jackson, NotificationEvent.class)
                .enrich("direct:lookupRecipientProfile", new ProfileAggregationStrategy())
                .log("AUDIT: Message notification [event=${body.event} from=${body.sender} "
                        + "to=${body.recipient} displayName=${body.recipientDisplayName}]");

        from("direct:lookupRecipientProfile")
                .routeId("profile-lookup")
                .setBody(simple("${body.recipient}"))
                .bean("userProfileService", "getOrCreate");
    }

    private static class ProfileAggregationStrategy implements AggregationStrategy {
        @Override
        @SuppressWarnings("unchecked")
        public Exchange aggregate(Exchange original, Exchange resource) {
            NotificationEvent event = original.getIn().getBody(NotificationEvent.class);
            Map<String, Object> profile = resource.getIn().getBody(Map.class);
            if (profile != null) {
                event.setRecipientDisplayName((String) profile.get("displayName"));
                event.setRecipientPreferredLanguage((String) profile.get("preferredLanguage"));
            }
            original.getIn().setBody(event);
            return original;
        }
    }
}
