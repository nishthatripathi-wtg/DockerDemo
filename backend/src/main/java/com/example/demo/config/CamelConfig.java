package com.example.demo.config;

import org.apache.activemq.ActiveMQConnectionFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jms.connection.CachingConnectionFactory;

import jakarta.jms.ConnectionFactory;

@Configuration
public class CamelConfig {

    @Bean
    public ConnectionFactory jmsConnectionFactory(
            @Value("${activemq.broker-url}") String brokerUrl) {
        ActiveMQConnectionFactory factory = new ActiveMQConnectionFactory(brokerUrl);
        CachingConnectionFactory caching = new CachingConnectionFactory(factory);
        caching.setSessionCacheSize(20);
        return caching;
    }
}
