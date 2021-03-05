(function($) {

    'use strict';

    if (typeof wpcf7 === 'undefined' || wpcf7 === null) {
        return;
    }

    wpcf7 = $.extend({
        cached: 0,
        inputs: []
    }, wpcf7);

    $(function() {
        wpcf7.supportHtml5 = (function() {
            var features = {};
            var input = document.createElement('input');

            features.placeholder = 'placeholder' in input;

            var inputTypes = ['email', 'url', 'tel', 'number', 'range', 'date'];

            $.each(inputTypes, function(index, value) {
                input.setAttribute('type', value);
                features[value] = input.type !== 'text';
            });

            return features;
        })();

        $('div.wpcf7 > form').each(function() {
            var $form = $(this);
            wpcf7.initForm($form);

            if (wpcf7.cached) {
                wpcf7.refill($form);
            }
        });
    });

    wpcf7.getId = function(form) {
        return parseInt($('input[name="_wpcf7"]', form).val(), 10);
    };

    wpcf7.initForm = function(form) {
        var $form = $(form);

        $form.submit(function(event) {
            if (typeof window.FormData !== 'function') {
                return;
            }

            wpcf7.submit($form);
            event.preventDefault();
        });

        $('.wpcf7-submit', $form).after('<span class="ajax-loader"></span>');

        wpcf7.toggleSubmit($form);

        $form.on('click', '.wpcf7-acceptance', function() {
            wpcf7.toggleSubmit($form);
        });

        // Exclusive Checkbox
        $('.wpcf7-exclusive-checkbox', $form).on('click', 'input:checkbox', function() {
            var name = $(this).attr('name');
            $form.find('input:checkbox[name="' + name + '"]').not(this).prop('checked', false);
        });

        // Free Text Option for Checkboxes and Radio Buttons
        $('.wpcf7-list-item.has-free-text', $form).each(function() {
            var $freetext = $(':input.wpcf7-free-text', this);
            var $wrap = $(this).closest('.wpcf7-form-control');

            if ($(':checkbox, :radio', this).is(':checked')) {
                $freetext.prop('disabled', false);
            } else {
                $freetext.prop('disabled', true);
            }

            $wrap.on('change', ':checkbox, :radio', function() {
                var $cb = $('.has-free-text', $wrap).find(':checkbox, :radio');

                if ($cb.is(':checked')) {
                    $freetext.prop('disabled', false).focus();
                } else {
                    $freetext.prop('disabled', true);
                }
            });
        });

        // Placeholder Fallback
        if (!wpcf7.supportHtml5.placeholder) {
            $('[placeholder]', $form).each(function() {
                $(this).val($(this).attr('placeholder'));
                $(this).addClass('placeheld');

                $(this).focus(function() {
                    if ($(this).hasClass('placeheld')) {
                        $(this).val('').removeClass('placeheld');
                    }
                });

                $(this).blur(function() {
                    if ('' === $(this).val()) {
                        $(this).val($(this).attr('placeholder'));
                        $(this).addClass('placeheld');
                    }
                });
            });
        }

        if (wpcf7.jqueryUi && !wpcf7.supportHtml5.date) {
            $form.find('input.wpcf7-date[type="date"]').each(function() {
                $(this).datepicker({
                    dateFormat: 'yy-mm-dd',
                    minDate: new Date($(this).attr('min')),
                    maxDate: new Date($(this).attr('max'))
                });
            });
        }

        if (wpcf7.jqueryUi && !wpcf7.supportHtml5.number) {
            $form.find('input.wpcf7-number[type="number"]').each(function() {
                $(this).spinner({
                    min: $(this).attr('min'),
                    max: $(this).attr('max'),
                    step: $(this).attr('step')
                });
            });
        }

        // Character Count
        $('.wpcf7-character-count', $form).each(function() {
            var $count = $(this);
            var name = $count.attr('data-target-name');
            var down = $count.hasClass('down');
            var starting = parseInt($count.attr('data-starting-value'), 10);
            var maximum = parseInt($count.attr('data-maximum-value'), 10);
            var minimum = parseInt($count.attr('data-minimum-value'), 10);

            var updateCount = function(target) {
                var $target = $(target);
                var length = $target.val().length;
                var count = down ? starting - length : length;
                $count.attr('data-current-value', count);
                $count.text(count);

                if (maximum && maximum < length) {
                    $count.addClass('too-long');
                } else {
                    $count.removeClass('too-long');
                }

                if (minimum && length < minimum) {
                    $count.addClass('too-short');
                } else {
                    $count.removeClass('too-short');
                }
            };

            $(':input[name="' + name + '"]', $form).each(function() {
                updateCount(this);

                $(this).keyup(function() {
                    updateCount(this);
                });
            });
        });

        // URL Input Correction
        $form.on('change', '.wpcf7-validates-as-url', function() {
            var val = $.trim($(this).val());

            if (val &&
                !val.match(/^[a-z][a-z0-9.+-]*:/i) &&
                -1 !== val.indexOf('.')) {
                val = val.replace(/^\/+/, '');
                val = 'http://' + val;
            }

            $(this).val(val);
        });
    };

    wpcf7.submit = function(form) {
        if (typeof window.FormData !== 'function') {
            return;
        }

        var $form = $(form);

        $('.ajax-loader', $form).addClass('is-active');

        $('[placeholder].placeheld', $form).each(function(i, n) {
            $(n).val('');
        });

        wpcf7.clearResponse($form);

        var formData = new FormData($form.get(0));

        var detail = {
            id: $form.closest('div.wpcf7').attr('id'),
            status: 'init',
            inputs: [],
            formData: formData
        };

        $.each($form.serializeArray(), function(i, field) {
            if ('_wpcf7' == field.name) {
                detail.contactFormId = field.value;
            } else if ('_wpcf7_version' == field.name) {
                detail.pluginVersion = field.value;
            } else if ('_wpcf7_locale' == field.name) {
                detail.contactFormLocale = field.value;
            } else if ('_wpcf7_unit_tag' == field.name) {
                detail.unitTag = field.value;
            } else if ('_wpcf7_container_post' == field.name) {
                detail.containerPostId = field.value;
            } else if (field.name.match(/^_wpcf7_\w+_free_text_/)) {
                var owner = field.name.replace(/^_wpcf7_\w+_free_text_/, '');
                detail.inputs.push({
                    name: owner + '-free-text',
                    value: field.value
                });
            } else if (field.name.match(/^_/)) {
                // do nothing
            } else {
                detail.inputs.push(field);
            }
        });

        wpcf7.triggerEvent($form.closest('div.wpcf7'), 'beforesubmit', detail);

        var ajaxSuccess = function(data, status, xhr, $form) {
            detail.id = $(data.into).attr('id');
            detail.status = data.status;
            detail.apiResponse = data;

            var $message = $('.wpcf7-response-output', $form);

            switch (data.status) {
                case 'validation_failed':
                    $.each(data.invalidFields, function(i, n) {
                        $(n.into, $form).each(function() {
                            wpcf7.notValidTip(this, n.message);
                            $('.wpcf7-form-control', this).addClass('wpcf7-not-valid');
                            $('[aria-invalid]', this).attr('aria-invalid', 'true');
                        });
                    });

                    $message.addClass('wpcf7-validation-errors');
                    $form.addClass('invalid');

                    wpcf7.triggerEvent(data.into, 'invalid', detail);
                    break;
                case 'acceptance_missing':
                    $message.addClass('wpcf7-acceptance-missing');
                    $form.addClass('unaccepted');

                    wpcf7.triggerEvent(data.into, 'unaccepted', detail);
                    break;
                case 'spam':
                    $message.addClass('wpcf7-spam-blocked');
                    $form.addClass('spam');

                    $('[name="g-recaptcha-response"]', $form).each(function() {
                        if ('' === $(this).val()) {
                            var $recaptcha = $(this).closest('.wpcf7-form-control-wrap');
                            wpcf7.notValidTip($recaptcha, wpcf7.recaptcha.messages.empty);
                        }
                    });

                    wpcf7.triggerEvent(data.into, 'spam', detail);
                    break;
                case 'aborted':
                    $message.addClass('wpcf7-aborted');
                    $form.addClass('aborted');

                    wpcf7.triggerEvent(data.into, 'aborted', detail);
                    break;
                case 'mail_sent':
                    $message.addClass('wpcf7-mail-sent-ok');
                    $form.addClass('sent');

                    wpcf7.triggerEvent(data.into, 'mailsent', detail);
                    break;
                case 'mail_failed':
                    $message.addClass('wpcf7-mail-sent-ng');
                    $form.addClass('failed');

                    wpcf7.triggerEvent(data.into, 'mailfailed', detail);
                    break;
                default:
                    var customStatusClass = 'custom-' +
                        data.status.replace(/[^0-9a-z]+/i, '-');
                    $message.addClass('wpcf7-' + customStatusClass);
                    $form.addClass(customStatusClass);
            }

            wpcf7.refill($form, data);

            wpcf7.triggerEvent(data.into, 'submit', detail);

            if ('mail_sent' == data.status) {
                $form.each(function() {
                    this.reset();
                });

                wpcf7.toggleSubmit($form);
            }

            $form.find('[placeholder].placeheld').each(function(i, n) {
                $(n).val($(n).attr('placeholder'));
            });

            $message.html('').append(data.message).slideDown('fast');
            $message.attr('role', 'alert');

            $('.screen-reader-response', $form.closest('.wpcf7')).each(function() {
                var $response = $(this);
                $response.html('').attr('role', '').append(data.message);

                if (data.invalidFields) {
                    var $invalids = $('<ul></ul>');

                    $.each(data.invalidFields, function(i, n) {
                        if (n.idref) {
                            var $li = $('<li></li>').append($('<a></a>').attr('href', '#' + n.idref).append(n.message));
                        } else {
                            var $li = $('<li></li>').append(n.message);
                        }

                        $invalids.append($li);
                    });

                    $response.append($invalids);
                }

                $response.attr('role', 'alert').focus();
            });
        };

        $.ajax({
            type: 'POST',
            url: wpcf7.apiSettings.getRoute(
                '/contact-forms/' + wpcf7.getId($form) + '/feedback'),
            data: formData,
            dataType: 'json',
            processData: false,
            contentType: false
        }).done(function(data, status, xhr) {
            ajaxSuccess(data, status, xhr, $form);
            $('.ajax-loader', $form).removeClass('is-active');
        }).fail(function(xhr, status, error) {
            var $e = $('<div class="ajax-error"></div>').text(error.message);
            $form.after($e);
        });
    };

    wpcf7.triggerEvent = function(target, name, detail) {
        var $target = $(target);

        /* DOM event */
        var event = new CustomEvent('wpcf7' + name, {
            bubbles: true,
            detail: detail
        });

        $target.get(0).dispatchEvent(event);

        /* jQuery event */
        $target.trigger('wpcf7:' + name, detail);
        $target.trigger(name + '.wpcf7', detail); // deprecated
    };

    wpcf7.toggleSubmit = function(form, state) {
        var $form = $(form);
        var $submit = $('input:submit', $form);

        if (typeof state !== 'undefined') {
            $submit.prop('disabled', !state);
            return;
        }

        if ($form.hasClass('wpcf7-acceptance-as-validation')) {
            return;
        }

        $submit.prop('disabled', false);

        $('.wpcf7-acceptance', $form).each(function() {
            var $span = $(this);
            var $input = $('input:checkbox', $span);

            if (!$span.hasClass('optional')) {
                if ($span.hasClass('invert') && $input.is(':checked') ||
                    !$span.hasClass('invert') && !$input.is(':checked')) {
                    $submit.prop('disabled', true);
                    return false;
                }
            }
        });
    };

    wpcf7.notValidTip = function(target, message) {
        var $target = $(target);
        $('.wpcf7-not-valid-tip', $target).remove();
        $('<span role="alert" class="wpcf7-not-valid-tip"></span>')
            .text(message).appendTo($target);

        if ($target.is('.use-floating-validation-tip *')) {
            var fadeOut = function(target) {
                $(target).not(':hidden').animate({
                    opacity: 0
                }, 'fast', function() {
                    $(this).css({ 'z-index': -100 });
                });
            };

            $target.on('mouseover', '.wpcf7-not-valid-tip', function() {
                fadeOut(this);
            });

            $target.on('focus', ':input', function() {
                fadeOut($('.wpcf7-not-valid-tip', $target));
            });
        }
    };

    wpcf7.refill = function(form, data) {
        var $form = $(form);

        var refillCaptcha = function($form, items) {
            $.each(items, function(i, n) {
                $form.find(':input[name="' + i + '"]').val('');
                $form.find('img.wpcf7-captcha-' + i).attr('src', n);
                var match = /([0-9]+)\.(png|gif|jpeg)$/.exec(n);
                $form.find('input:hidden[name="_wpcf7_captcha_challenge_' + i + '"]').attr('value', match[1]);
            });
        };

        var refillQuiz = function($form, items) {
            $.each(items, function(i, n) {
                $form.find(':input[name="' + i + '"]').val('');
                $form.find(':input[name="' + i + '"]').siblings('span.wpcf7-quiz-label').text(n[0]);
                $form.find('input:hidden[name="_wpcf7_quiz_answer_' + i + '"]').attr('value', n[1]);
            });
        };

        if (typeof data === 'undefined') {
            $.ajax({
                type: 'GET',
                url: wpcf7.apiSettings.getRoute(
                    '/contact-forms/' + wpcf7.getId($form) + '/refill'),
                beforeSend: function(xhr) {
                    var nonce = $form.find(':input[name="_wpnonce"]').val();

                    if (nonce) {
                        xhr.setRequestHeader('X-WP-Nonce', nonce);
                    }
                },
                dataType: 'json'
            }).done(function(data, status, xhr) {
                if (data.captcha) {
                    refillCaptcha($form, data.captcha);
                }

                if (data.quiz) {
                    refillQuiz($form, data.quiz);
                }
            });

        } else {
            if (data.captcha) {
                refillCaptcha($form, data.captcha);
            }

            if (data.quiz) {
                refillQuiz($form, data.quiz);
            }
        }
    };

    wpcf7.clearResponse = function(form) {
        var $form = $(form);
        $form.removeClass('invalid spam sent failed');
        $form.siblings('.screen-reader-response').html('').attr('role', '');

        $('.wpcf7-not-valid-tip', $form).remove();
        $('[aria-invalid]', $form).attr('aria-invalid', 'false');
        $('.wpcf7-form-control', $form).removeClass('wpcf7-not-valid');

        $('.wpcf7-response-output', $form)
            .hide().empty().removeAttr('role')
            .removeClass('wpcf7-mail-sent-ok wpcf7-mail-sent-ng wpcf7-validation-errors wpcf7-spam-blocked');
    };

    wpcf7.apiSettings.getRoute = function(path) {
        var url = wpcf7.apiSettings.root;

        url = url.replace(
            wpcf7.apiSettings.namespace,
            wpcf7.apiSettings.namespace + path);

        return url;
    };

})(jQuery);

/*
 * Polyfill for Internet Explorer
 * See https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent
 */
(function() {
    if (typeof window.CustomEvent === "function") return false;

    function CustomEvent(event, params) {
        params = params || { bubbles: false, cancelable: false, detail: undefined };
        var evt = document.createEvent('CustomEvent');
        evt.initCustomEvent(event,
            params.bubbles, params.cancelable, params.detail);
        return evt;
    }

    CustomEvent.prototype = window.Event.prototype;

    window.CustomEvent = CustomEvent;
})();



;
(function($) {
    /**
     * File navigation.js.
     *
     * Handles toggling the navigation menu for small screens and enables TAB key
     * navigation support for dropdown menus.
     */
    +(function() {
        var container, button, menu, links, i, len;

        container = document.getElementById('site-navigation');
        if (!container) {
            return;
        }

        button = container.getElementsByTagName('button')[0];
        if ('undefined' === typeof button) {
            return;
        }

        menu = container.getElementsByTagName('ul')[0];

        // Hide menu toggle button if menu is empty and return early.
        if ('undefined' === typeof menu) {
            button.style.display = 'none';
            return;
        }

        menu.setAttribute('aria-expanded', 'false');
        if (-1 === menu.className.indexOf('nav-menu')) {
            menu.className += ' nav-menu';
        }

        button.onclick = function() {
            if (-1 !== container.className.indexOf('toggled')) {
                container.className = container.className.replace(' toggled', '');
                button.setAttribute('aria-expanded', 'false');
                menu.setAttribute('aria-expanded', 'false');
            } else {
                container.className += ' toggled';
                button.setAttribute('aria-expanded', 'true');
                menu.setAttribute('aria-expanded', 'true');
            }
        };

        // Get all the link elements within the menu.
        links = menu.getElementsByTagName('a');

        // Each time a menu link is focused or blurred, toggle focus.
        for (i = 0, len = links.length; i < len; i++) {
            links[i].addEventListener('focus', toggleFocus, true);
            links[i].addEventListener('blur', toggleFocus, true);
        }

        /**
         * Sets or removes .focus class on an element.
         */
        function toggleFocus() {
            var self = this;

            // Move up through the ancestors of the current link until we hit .nav-menu.
            while (-1 === self.className.indexOf('nav-menu')) {

                // On li elements toggle the class .focus.
                if ('li' === self.tagName.toLowerCase()) {
                    if (-1 !== self.className.indexOf('focus')) {
                        self.className = self.className.replace(' focus', '');
                    } else {
                        self.className += ' focus';
                    }
                }

                self = self.parentElement;
            }
        }

        /**
         * Toggles `focus` class to allow submenu access on tablets.
         */
        (function(container) {
            var touchStartFn, i,
                parentLink = container.querySelectorAll('.menu-item-has-children > a, .page_item_has_children > a');

            if ('ontouchstart' in window) {
                touchStartFn = function(e) {
                    var menuItem = this.parentNode,
                        i;

                    if (!menuItem.classList.contains('focus')) {
                        e.preventDefault();
                        for (i = 0; i < menuItem.parentNode.children.length; ++i) {
                            if (menuItem === menuItem.parentNode.children[i]) {
                                continue;
                            }
                            menuItem.parentNode.children[i].classList.remove('focus');
                        }
                        menuItem.classList.add('focus');
                    } else {
                        menuItem.classList.remove('focus');
                    }
                };

                for (i = 0; i < parentLink.length; ++i) {
                    parentLink[i].addEventListener('touchstart', touchStartFn, false);
                }
            }
        }(container));
    })();

    jQuery.fn.scrollTo = function(offset) {

        jQuery(document).on('click', this.selector, function(e) {
            e.preventDefault();
            var target = jQuery(this).attr('href');
            if ('undefined' != typeof target) {
                if (!offset) {
                    offset = 0;
                }
                var pos = jQuery(target).offset().top - offset;
                jQuery("html, body").animate({ scrollTop: pos }, 800);
            }
        });

        return this;
    };

    function scrollToTop(param) {

        this.markup = null,
            this.selector = null;
        this.fixed = true;
        this.visible = false;

        this.init = function() {

            if (this.valid()) {

                if (typeof param != 'undefined' && typeof param.fixed != 'undefined') {
                    this.fixed = param.fixed;
                }

                this.selector = (param && param.selector) ? param.selector : '#go-top';

                this.getMarkup();
                var that = this;

                jQuery('body').append(this.markup);

                if (this.fixed) {

                    jQuery(this.selector).hide();

                    var windowHeight = jQuery(window).height();

                    jQuery(window).scroll(function() {

                        var scrollPos = jQuery(window).scrollTop();

                        if ((scrollPos > (windowHeight - 100))) {

                            if (false == that.visible) {
                                jQuery(that.selector).fadeIn();
                                that.visible = true;
                            }

                        } else {

                            if (true == that.visible) {
                                jQuery(that.selector).fadeOut();
                                that.visible = false;
                            }
                        }
                    });

                    jQuery(this.selector).scrollTo();
                }
            }
        }

        this.getMarkup = function() {

            var position = this.fixed ? 'fixed' : 'absolute';

            var wrapperStyle = 'style="position: ' + position + '; z-index:999999; bottom: 20px; right: 20px;"';

            var buttonStyle = 'style="cursor:pointer;display: inline-block;padding: 10px 20px;background: #f15151;color: #fff;border-radius: 2px;"';

            var markup = '<div ' + wrapperStyle + ' id="go-top"><span ' + buttonStyle + '>Scroll To Top</span></div>';

            this.markup = (param && param.markup) ? param.markup : markup;
        }

        this.valid = function() {

            if (param && param.markup && !param.selector) {
                alert('Please provide selector. eg. { markup: "<div id=\'scroll-top\'></div>", selector: "#scroll-top"}');
                return false;
            }

            return true;
        }
    };
    /**
     * File skip-link-focus-fix.js.
     *
     * Helps with accessibility for keyboard only users.
     *
     * Learn more: https://git.io/vWdr2
     */
    +
    (function() {
        var isIe = /(trident|msie)/i.test(navigator.userAgent);

        if (isIe && document.getElementById && window.addEventListener) {
            window.addEventListener('hashchange', function() {
                var id = location.hash.substring(1),
                    element;

                if (!(/^[A-z0-9_-]+$/.test(id))) {
                    return;
                }

                element = document.getElementById(id);

                if (element) {
                    if (!(/^(?:a|select|input|button|textarea)$/i.test(element.tagName))) {
                        element.tabIndex = -1;
                    }

                    element.focus();
                }
            }, false);
        }
    })();

    /**
     * Setting up functionality for alternative menu
     * @since Business Consultr 1.0
     */
    function wpMenuAccordion(selector) {

        var $ele = selector + ' .menu-item-has-children > a';
        $($ele).each(function() {
            var text = $(this).text();
            text = text + '<span class="kfi kfi-arrow-carrot-down-alt2 triangle"></span>';
            $(this).html(text);
        });

        $(document).on('click', $ele + ' span.triangle', function(e) {
            e.preventDefault();
            e.stopPropagation();

            $parentLi = $(this).parent().parent('li');
            $childLi = $parentLi.find('li');

            if ($parentLi.hasClass('open')) {
                /**
                 * Closing all the ul inside and 
                 * removing open class for all the li's
                 */
                $parentLi.removeClass('open');
                $childLi.removeClass('open');

                $(this).parent('a').next().slideUp();
                $(this).parent('a').next().find('ul').slideUp();
            } else {

                $parentLi.addClass('open');
                $(this).parent('a').next().slideDown();
            }
        });
    };

    /**
     * Main menu height
     * @since Business Consultr 1.0.0
     */

    function maintainMenuHeight() {
        var init = function() {
            var h = parseInt(jQuery('.site-branding-outer').height());
            jQuery('#primary-nav-container').height(h);
            jQuery('#header-bottom-right-outer .callback-button').height(h);
        }

        init();
        jQuery(window).resize(init);
    }

    /**
     * Fire for fixed header
     * @since Business Consultr 1.0.0
     */

    function primaryHeader() {
        var h,
            fixedHeader = 'fixed-nav-active',
            addClass = function() {
                if (!$('body').hasClass(fixedHeader)) {
                    $('body').addClass(fixedHeader);
                }
            },
            removeClass = function() {
                if ($('body').hasClass(fixedHeader)) {
                    $('body').removeClass(fixedHeader);
                }
            },
            setPosition = function(top) {
                $('#masthead').css({
                    'top': top
                });
            },
            init = function() {
                h = $('.top-header').outerHeight();
                setPosition(h);
            },
            onScroll = function() {
                var scroll = jQuery(document).scrollTop(),
                    pos = 0,
                    height = h,
                    width = $(window).width();

                if (BUSINESSCONSULTR.is_admin_bar_showing && width >= 782) {
                    scroll = scroll + 32;
                }

                if (height) {
                    if (height >= scroll) {
                        pos = height - jQuery(document).scrollTop();
                        removeClass();
                    } else if (BUSINESSCONSULTR.is_admin_bar_showing && width >= 782) {
                        pos = 32;
                        addClass()
                    } else {
                        addClass();
                    }

                } else {

                    var mh = $('#masthead').outerHeight(),
                        scroll = jQuery(document).scrollTop();
                    if (mh >= scroll) {
                        if (BUSINESSCONSULTR.is_admin_bar_showing && width >= 782) {
                            pos = 32 - scroll;
                        } else {

                            pos = -scroll;
                        }
                        removeClass();
                    } else {

                        if (BUSINESSCONSULTR.is_admin_bar_showing && width >= 782) {
                            pos = 32;
                        } else {
                            pos = 0;
                        }
                        addClass();
                    }
                }

                setPosition(pos);
            };

        $(window).resize(function() {
            init();
            onScroll();
        });

        init();
        onScroll();

        $(window).scroll(onScroll);

        jQuery(window).load(function() {
            init();
            onScroll();
        });
    }

    /**
     * Increase cart count when product is added by ajax 
     * @uses Woocommerce
     * @since Business Consultr 1.0.0
     */
    jQuery(document).on('added_to_cart', function() {
        $ele = $('.cart-icon .count');
        var count = $ele.text();
        $ele.text(parseInt(count) + 1);
    });

    /**
     * Show or Hide Search field on clicking search icon
     * @since Business Consultr 1.0.0
     */
    jQuery(document).on('click', '.search-icon a', function(e) {
        e.preventDefault();
        jQuery('#search-form').toggleClass('search-slide');
    });

    /**
     * Fire slider for homepage
     * @link https://owlcarousel2.github.io/OwlCarousel2/docs/started-welcome.html
     * @since Business Consultr 1.0.0
     */
    function homeSlider() {
        var item_count = parseInt($('.block-slider .slide-item').length);
        $(".home-slider").owlCarousel({
            items: 1,
            autoHeight: false,
            autoHeightClass: 'name',
            animateOut: 'fadeOut',
            navContainer: '.block-slider .controls',
            dotsContainer: '#kt-slide-pager',
            autoplay: BUSINESSCONSULTR.home_slider.autoplay,
            autoplayTimeout: parseInt(BUSINESSCONSULTR.home_slider.timeout),
            loop: (item_count > 1) ? true : false,
            rtl: (BUSINESSCONSULTR.is_rtl == '1') ? true : false
        });
    };

    /**
     * Fire Slider for Testimonials
     * @link https://owlcarousel2.github.io/OwlCarousel2/docs/started-welcome.html
     * @since Business Consultr 1.0.0
     */
    function testimonialSlider() {
        $(".testimonial-carousel").owlCarousel({
            items: 1,
            animateOut: 'fadeOut',
            navContainer: '.block-testimonial .controls',
            dotsContainer: '#testimonial-pager',
            responsiveClass: true,
            responsive: {
                0: {
                    items: 1,
                    nav: true
                }
            },
            rtl: (BUSINESSCONSULTR.is_rtl == '1') ? true : false,
            loop: false,
            dots: true
        });
    };

    /**
     * Fire equal height
     * @since Blogto Pro 1.0.0
     */

    function equaleHeight(ele) {

        var getMaxHeight = function() {
            var height = 0;
            jQuery(ele).height('auto');
            jQuery(ele).each(function() {
                if (jQuery(this).height() > height) {
                    height = jQuery(this).height();
                }
            });
            return height;
        };

        var init = function() {

            var width = jQuery(window).width();
            var height = getMaxHeight();
            jQuery(ele).each(function() {
                jQuery(this).height(height);
            });

        };

        jQuery(document).ready(function() {
            init();
        });

        jQuery(window).resize(function() {
            init();
        });

        jQuery(window).load(function() {
            init();
        });
    };

    equaleHeight('.block-slider .slide-item');

    /**
     * Animate contact form fields when they are focused
     * @since Business Consultr 1.0.0
     */
    jQuery('.kt-contact-form-area input, .kt-contact-form-area textarea').on('focus', function() {
        var target = jQuery(this).attr('id');
        jQuery('label[for="' + target + '"]').addClass('move');
    });

    jQuery('.kt-contact-form-area input, .kt-contact-form-area textarea').on('blur', function() {
        var target = jQuery(this).attr('id');
        jQuery('label[for="' + target + '"]').removeClass('move');
    });

    jQuery(document).ready(function() {
        maintainMenuHeight();
        primaryHeader();

        $('.scroll-to').scrollTo();

        homeSlider();

        testimonialSlider();

        /**
         * Initializing scroll top js
         */
        new scrollToTop({
            markup: '<a href="#page" class="scroll-to ' + (BUSINESSCONSULTR.enable_scroll_top_in_mobile == 0 ? "hidden-xs" : "") + '" id="go-top"><span class="kfi kfi-arrow-up"></span></a>',
            selector: '#go-top'
        }).init();

        wpMenuAccordion('#offcanvas-menu');

        $(document).on('click', '.offcanvas-menu-toggler, .close-offcanvas-menu, .kt-offcanvas-overlay', function(e) {
            e.preventDefault();
            $('body').toggleClass('offcanvas-menu-open');
        });
        jQuery('body').append('<div class="kt-offcanvas-overlay"></div>');

        /**
         * Make sure if the masonry wrapper exists
         */
        if (jQuery('.masonry-wrapper').length > 0) {
            $grid = jQuery('.masonry-wrapper').masonry({
                itemSelector: '.masonry-grid',
                percentPosition: true,
            });
        }

        /**
         * Make support for Jetpack's infinite scroll on masonry layout
         */
        infinite_count = 0;
        $(document.body).on('post-load', function() {

            infinite_count = infinite_count + 1;
            var container = '#infinite-view-' + infinite_count;
            $(container).hide();

            $($(container + ' .masonry-grid')).each(function() {
                $items = $(this);
                $grid.append($items).masonry('appended', $items);
            });

            setTimeout(function() {
                $grid.masonry('layout');
            }, 500);
        });

        /**
         * Modify default search placeholder
         */
        $('#masthead #s').attr('placeholder', BUSINESSCONSULTR.search_placeholder);
        $('#searchform #s').attr('placeholder', BUSINESSCONSULTR.search_default_placeholder);
    });

    jQuery(window).load(function() {
        if ('undefined' !== typeof $grid) {
            $grid.masonry('reloadItems');
            $grid.masonry('layout');
        }
    });

    jQuery(window).load(function() {
        jQuery('#site-loader').fadeOut(500);
    });

})(jQuery);




! function(a, b) { "use strict";

    function c() { if (!e) { e = !0; var a, c, d, f, g = -1 !== navigator.appVersion.indexOf("MSIE 10"),
                h = !!navigator.userAgent.match(/Trident.*rv:11\./),
                i = b.querySelectorAll("iframe.wp-embedded-content"); for (c = 0; c < i.length; c++) { if (d = i[c], !d.getAttribute("data-secret")) f = Math.random().toString(36).substr(2, 10), d.src += "#?secret=" + f, d.setAttribute("data-secret", f); if (g || h) a = d.cloneNode(!0), a.removeAttribute("security"), d.parentNode.replaceChild(a, d) } } } var d = !1,
        e = !1; if (b.querySelector)
        if (a.addEventListener) d = !0;
    if (a.wp = a.wp || {}, !a.wp.receiveEmbedMessage)
        if (a.wp.receiveEmbedMessage = function(c) { var d = c.data; if (d)
                    if (d.secret || d.message || d.value)
                        if (!/[^a-zA-Z0-9]/.test(d.secret)) { var e, f, g, h, i, j = b.querySelectorAll('iframe[data-secret="' + d.secret + '"]'),
                                k = b.querySelectorAll('blockquote[data-secret="' + d.secret + '"]'); for (e = 0; e < k.length; e++) k[e].style.display = "none"; for (e = 0; e < j.length; e++)
                                if (f = j[e], c.source === f.contentWindow) { if (f.removeAttribute("style"), "height" === d.message) { if (g = parseInt(d.value, 10), g > 1e3) g = 1e3;
                                        else if (~~g < 200) g = 200;
                                        f.height = g } if ("link" === d.message)
                                        if (h = b.createElement("a"), i = b.createElement("a"), h.href = f.getAttribute("src"), i.href = d.value, i.host === h.host)
                                            if (b.activeElement === f) a.top.location.href = d.value } else; } }, d) a.addEventListener("message", a.wp.receiveEmbedMessage, !1), b.addEventListener("DOMContentLoaded", c, !1), a.addEventListener("load", c, !1) }(window, document);