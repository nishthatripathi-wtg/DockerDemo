package com.example.translator.controller;

import com.example.translator.dto.TranslateRequest;
import com.example.translator.dto.TranslateResponse;
import com.example.translator.service.LibreTranslateService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/translate")
public class TranslateController {

    private final LibreTranslateService translateService;

    public TranslateController(LibreTranslateService translateService) {
        this.translateService = translateService;
    }

    @PostMapping
    public TranslateResponse translate(@RequestBody TranslateRequest request) {
        return translateService.translate(
                request.getText(),
                request.getSource(),
                request.getTarget()
        );
    }
}
